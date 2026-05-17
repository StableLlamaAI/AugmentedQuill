// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Convergence Map view — shows scenes sorted chronologically (same
 * layout as the Chronological view) with one vertical SVG "snake" path per
 * sourcebook entry drawn behind the cards. The snake follows the
 * prose/experience order of the entry, turning with smooth hairpin arcs
 * whenever a time-travel jump reverses the direction on screen.
 */

import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  useEffect,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, SceneId } from '../../types';
import type {
  Chapter,
  Book,
  SourcebookEntry,
  SceneTagPersonalDatetime,
} from '../../types/domain';
import { useTheme } from '../layout/ThemeContext';
import { useSceneLanes } from './useSceneLanes';
import { LaneHeader } from './LaneHeader';
import { SceneCard } from './SceneCard';
import { useSceneSelection } from './useSceneSelection';
import { buildChapterOrderMap, chronologicalSort } from './sceneSortUtils';
import type { ProjectType } from './sceneSortUtils';
import {
  buildTimelinePanelModel,
  type TimelineJumpEvent,
} from './convergenceMapTimeline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConvergenceMapViewProps {
  scenes: Scene[];
  sourcebookEntries?: SourcebookEntry[];
  projectType: ProjectType;
  chapters: Chapter[];
  books?: Book[];
  primarySelectedSceneId: SceneId | null;
  onSelectScene: (id: SceneId | null) => void;
  onSelectionChange?: (ids: ReadonlySet<SceneId>) => void;
  onEditScene?: (id: SceneId) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRACK_W = 16; // px — lateral track spacing for hairpin turns
const R = TRACK_W / 2; // hairpin arc radius (= 8 px)
const SCENE_CIRCLE_R = 5; // snake node circle radius

// Left timeline panel
const TL_LANE_START_X = 8; // px — X position of the left-most timeline lane
const TL_LANE_GAP = 28; // px — horizontal spacing between timeline lanes
const TL_DOT_R = 4; // px — radius of scene dots on timeline
const TL_LOOP_W_CROSS = 30; // px — baseline bow for cross-lane jumps
const TL_LOOP_W_SAME = 14; // px — baseline bow for same-lane jumps (= TL_LANE_GAP/2)
const TL_MAX_LOOP_W = 56; // px — reserved right-side space for routed jump channels
const TL_CORNER_R = 6; // px — rounded corner radius on loop arrows
const TL_RIGHT_PAD = 8; // px — right breathing room for arrow heads
const DEFAULT_PLACEHOLDER_ROW_HEIGHT = 84; // px — fallback until card heights are measured

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

type CardLayoutEntry = { x: number; y: number; w: number; h: number };

type MeasuredRowEntry = { y: number; h: number };

const getLayoutCenterY = (layout: { y: number; h: number }): number => {
  return layout.y + layout.h / 2;
};

/**
 * Count how many times the path direction changes (DOWN→UP or UP→DOWN)
 * when visiting proseScenes in order, using cardLayouts for Y coordinates.
 * Each direction change corresponds to one hairpin arc (+TRACK_W lateral shift).
 */
function countDirectionChanges(
  proseScenes: Scene[],
  cardLayouts: Map<SceneId, CardLayoutEntry>
): number {
  let changes = 0;
  let prevY: number | null = null;
  let goingDown: boolean | null = null;

  for (const scene of proseScenes) {
    const layout = cardLayouts.get(scene.id);
    if (!layout) continue;
    const y = layout.y + layout.h / 2;

    if (prevY !== null) {
      const movingDown = y >= prevY;
      if (goingDown === null) {
        goingDown = movingDown;
      } else if (goingDown !== movingDown) {
        changes++;
        goingDown = movingDown;
      }
    }
    prevY = y;
  }
  return changes;
}

/**
 * Build an SVG path string for one entry's snake.
 *
 * Scenes are visited in prose order; cardLayouts provides the measured Y of
 * each card's top edge. The path starts at (laneCenterX offset for centering,
 * first scene Y) and:
 *   - goes straight when direction is unchanged
 *   - inserts a BOTTOM hairpin (CW horizontal semicircle, bows downward) when
 *     direction changes from DOWN → UP (time travel backward)
 *   - inserts a TOP hairpin (CCW horizontal semicircle, bows upward) when
 *     direction changes from UP → DOWN (return to forward chronology)
 *
 * Arc geometry (dy = 0 horizontal semicircles):
 *   Bottom hairpin: a R,R 0 0 0 TRACK_W,0  (CCW, tangent DOWN→UP)
 *   Top    hairpin: a R,R 0 0 1 TRACK_W,0  (CW, tangent UP→DOWN)
 */
function buildSnakePath(
  proseScenes: Scene[],
  cardLayouts: Map<SceneId, CardLayoutEntry>,
  laneCenterX: number
): { pathData: string; sceneXById: Map<SceneId, number> } {
  const sceneXById = new Map<SceneId, number>();
  const parts: string[] = [];

  const numChanges = countDirectionChanges(proseScenes, cardLayouts);
  let currentX = laneCenterX - (numChanges * TRACK_W) / 2;

  let prevY: number | null = null;
  let goingDown: boolean | null = null;
  let started = false;

  for (const scene of proseScenes) {
    const layout = cardLayouts.get(scene.id);
    if (!layout) continue;
    const y = layout.y + layout.h / 2;

    if (!started) {
      parts.push(`M ${currentX},${y}`);
      sceneXById.set(scene.id, currentX);
      started = true;
      prevY = y;
      continue;
    }

    const movingDown = y >= prevY!;

    if (goingDown === null) {
      // First move after start — go straight and record direction.
      parts.push(`L ${currentX},${y}`);
      sceneXById.set(scene.id, currentX);
      goingDown = movingDown;
    } else if (goingDown === movingDown) {
      // Continuing in same direction — straight line.
      parts.push(`L ${currentX},${y}`);
      sceneXById.set(scene.id, currentX);
    } else if (goingDown && !movingDown) {
      // Was going DOWN, now going UP → BOTTOM hairpin.
      // Continue down R px to the arc bottom, then CW semicircle bowing down.
      parts.push(`L ${currentX},${prevY! + R}`);
      parts.push(`a ${R},${R} 0 0 1 ${TRACK_W},0`);
      currentX += TRACK_W;
      parts.push(`L ${currentX},${y}`);
      sceneXById.set(scene.id, currentX);
      goingDown = false;
    } else {
      // Was going UP, now going DOWN → TOP hairpin.
      // Continue up R px to the arc top, then CCW semicircle bowing up.
      parts.push(`L ${currentX},${prevY! - R}`);
      parts.push(`a ${R},${R} 0 0 0 ${TRACK_W},0`);
      currentX += TRACK_W;
      parts.push(`L ${currentX},${y}`);
      sceneXById.set(scene.id, currentX);
      goingDown = true;
    }

    prevY = y;
  }

  return { pathData: parts.join(' '), sceneXById };
}

/**
 * Build an SVG path string for a time travel arrow on the left timeline panel.
 * The arrow loops from depY → destY, bowing RIGHT of the track (toward the scene cards).
 *
 *  destY > depY (forward jump): arrow goes DOWN on the right
 *  destY < depY (backward jump): arrow goes UP on the right
 *
 * Shape: start at (TL_TRACK_X, depY), horizontal right to loop edge,
 * vertical to destY, horizontal left back to TL_TRACK_X.
 * Corners are rounded with radius TL_CORNER_R.
 */
/**
 * Universal time-travel arrow geometry.
 *
 * By default jumps bow to the RIGHT of max(sourceX, destinationX). Callers may
 * pass a custom `loopX` to keep a jump in a lane-local side channel instead.
 *
 * The shape is always a U-like path opening toward the right-side channel:
 *
 *   ┌── rx ──┐
 *   │        │
 *   srcX    dstX  (same lane → dstX = srcX, so it bows right and returns)
 *
 * Backward jump (destY < depY, going UP in the SVG): arrowhead tip points UP.
 * Forward jump  (destY ≥ depY, going DOWN):          arrowhead tip points DOWN.
 */
function buildTimeTravelArrowGeometry(
  sourceX: number,
  depY: number,
  destinationX: number,
  destY: number,
  loopX?: number
): { pathData: string; endX: number; endY: number } {
  const cr = TL_CORNER_R;
  const rx = loopX ?? Math.max(sourceX, destinationX) + TL_LOOP_W_CROSS;
  const goingDown = destY >= depY;

  if (goingDown) {
    const endY = destY; // Adjusted to end exactly at destination point
    return {
      pathData: [
        `M ${sourceX},${depY}`,
        `L ${rx - cr},${depY}`,
        `a ${cr},${cr} 0 0 1 ${cr},${cr}`,
        `L ${rx},${destY - cr}`,
        `a ${cr},${cr} 0 0 1 ${-cr},${cr}`,
        `L ${destinationX},${destY}`,
      ].join(' '),
      endX: destinationX,
      endY: destY,
    };
  }

  return {
    pathData: [
      `M ${sourceX},${depY}`,
      `L ${rx - cr},${depY}`,
      `a ${cr},${cr} 0 0 0 ${cr},${-cr}`,
      `L ${rx},${destY + cr}`,
      `a ${cr},${cr} 0 0 0 ${-cr},${-cr}`,
      `L ${destinationX},${destY}`,
    ].join(' '),
    endX: destinationX,
    endY: destY,
  };
}

function getTimeTravelLoopX(
  sourceX: number,
  destinationX: number,
  depY: number,
  destY: number
): number {
  if (sourceX === destinationX && destY < depY) {
    return sourceX + TL_LOOP_W_SAME;
  }

  return Math.max(sourceX, destinationX) + TL_LOOP_W_CROSS;
}

function buildTimelineBranchConnectorGeometry(
  sourceX: number,
  sourceY: number,
  destinationX: number,
  destinationY: number,
  loopX?: number
): string {
  if (Math.abs(destinationY - sourceY) < 0.5) {
    return [`M ${sourceX},${sourceY}`, `L ${destinationX},${destinationY}`].join(' ');
  }

  const cr = TL_CORNER_R;
  const rx = loopX ?? Math.max(sourceX, destinationX) + TL_LOOP_W_CROSS;

  if (destinationY > sourceY) {
    return [
      `M ${sourceX},${sourceY}`,
      `L ${rx - cr},${sourceY}`,
      `a ${cr},${cr} 0 0 1 ${cr},${cr}`,
      `L ${rx},${destinationY - cr}`,
      `a ${cr},${cr} 0 0 1 ${-cr},${cr}`,
      `L ${destinationX},${destinationY}`,
    ].join(' ');
  }

  return [
    `M ${sourceX},${sourceY}`,
    `L ${rx - cr},${sourceY}`,
    `a ${cr},${cr} 0 0 0 ${cr},${-cr}`,
    `L ${rx},${destinationY + cr}`,
    `a ${cr},${cr} 0 0 0 ${-cr},${-cr}`,
    `L ${destinationX},${destinationY}`,
  ].join(' ');
}

function buildBranchCreationArrowGeometry(
  sourceX: number,
  depY: number,
  destinationLaneX: number,
  destY: number
): { pathData: string; endX: number; endY: number } {
  const targetX = (sourceX + destinationLaneX) / 2;
  const dx = targetX - sourceX;
  const goingDown = destY >= depY;
  const cr = Math.min(TL_CORNER_R, Math.abs(dx));

  if (cr < 0.5) {
    return {
      pathData: [`M ${sourceX},${depY}`, `L ${targetX},${destY}`].join(' '),
      endX: targetX,
      endY: destY,
    };
  }

  const approachX = targetX - Math.sign(dx) * cr;
  const arcDx = Math.sign(dx) * cr;
  const arcDy = goingDown ? cr : -cr;
  const sweepFlag = dx > 0 ? (goingDown ? 1 : 0) : goingDown ? 0 : 1;

  return {
    pathData: [
      `M ${sourceX},${depY}`,
      `L ${approachX},${depY}`,
      `a ${cr},${cr} 0 0 ${sweepFlag} ${arcDx},${arcDy}`,
      `L ${targetX},${destY}`,
    ].join(' '),
    endX: targetX,
    endY: destY,
  };
}

function buildSpawnedTimelineTrackPath(
  parentLaneX: number,
  laneX: number,
  spawnY: number,
  overlayHeight: number
): string {
  const cornerRadius = TL_CORNER_R;
  const dx = laneX - parentLaneX;
  const absDx = Math.abs(dx);
  const horizontalSign = dx >= 0 ? 1 : -1;
  const usableCornerRadius = Math.min(cornerRadius, absDx / 2);

  // If the parent and destination lanes are effectively the same X,
  // fall back to a direct vertical continuation.
  if (absDx < 0.5 || usableCornerRadius < 0.5) {
    return [`M ${laneX},${spawnY}`, `L ${laneX},${overlayHeight}`].join(' ');
  }

  const horizontalEndX = laneX - horizontalSign * usableCornerRadius;
  const arcDx = horizontalSign * usableCornerRadius;
  const arcDy = usableCornerRadius;

  return [
    `M ${parentLaneX},${spawnY}`,
    `L ${horizontalEndX},${spawnY}`,
    `a ${usableCornerRadius},${usableCornerRadius} 0 0 ${horizontalSign > 0 ? 1 : 0} ${arcDx},${arcDy}`,
    `L ${laneX},${overlayHeight}`,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Intentionally kept as one component to keep map layout and overlay geometry together.
/* eslint-disable complexity */
// eslint-disable-next-line max-lines-per-function
export const ConvergenceMapView: React.FC<ConvergenceMapViewProps> = ({
  scenes,
  sourcebookEntries = [],
  projectType,
  chapters,
  books = [],
  primarySelectedSceneId,
  onSelectScene,
  onSelectionChange,
  onEditScene,
}: ConvergenceMapViewProps) => {
  const { t } = useTranslation();
  const { isLight } = useTheme();

  // Lane state (shared with NarrativeView via useSceneLanes).
  const lanes = useSceneLanes({
    scenes,
    sourcebookEntries,
    onSelectScene,
    onSelectionChange,
  });
  const {
    visibleLaneEntryIds,
    selectedLaneEntryIds,
    markerStyleBySceneId,
    filteredScenes,
    sceneEpochNanosecondsById,
    laneScrollLeft,
    setLaneScrollLeft,
    handleBackgroundMouseDown,
    laneButtonRefs,
  } = lanes;

  // Build chapter order map for chronological Y-axis sorting.
  const chapterOrderMap = useMemo(
    () => buildChapterOrderMap(projectType, chapters, books),
    [projectType, chapters, books]
  );

  // Sort ALL filtered scenes chronologically — this is the Y-axis order.
  const sortedScenes = useMemo(
    () =>
      [...filteredScenes].sort((a: Scene, b: Scene) =>
        chronologicalSort(a, b, chapterOrderMap, sceneEpochNanosecondsById)
      ),
    [filteredScenes, chapterOrderMap, sceneEpochNanosecondsById]
  );

  // Multi-select state — same semantics as NarrativeView.
  const { selectedSceneIds, activeSceneId, handleCardSelect } = useSceneSelection({
    displayOrder: sortedScenes,
    primarySelectedSceneId,
    onSelectScene,
    onSelectionChange,
  });

  // Cause/effect glow — same as NarrativeView.
  const activeScene = activeSceneId
    ? (scenes.find((s: Scene) => s.id === activeSceneId) ?? null)
    : null;
  const causeIds = new Set<SceneId>(activeScene?.order_after ?? []);
  const effectIds = new Set<SceneId>(activeScene?.order_before ?? []);

  // Display index for each scene card (sequential position in sorted list).
  const sceneIndexMap = useMemo(() => {
    const map = new Map<SceneId, number>();
    sortedScenes.forEach((s: Scene, i: number) => map.set(s.id, i));
    return map;
  }, [sortedScenes]);

  // -------------------------------------------------------------------------
  // Refs & measured layout state (same pattern as NarrativeView)
  // -------------------------------------------------------------------------

  const rootRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const laneTrackRef = useRef<HTMLDivElement>(null);
  const bottomLaneScrollRef = useRef<HTMLDivElement>(null);
  const cardWrapperRefs = useRef(new Map<SceneId, HTMLDivElement>());
  const epochGapRefs = useRef(new Map<string, HTMLDivElement>());

  const [cardLayouts, setCardLayouts] = useState<Map<SceneId, CardLayoutEntry>>(
    new Map()
  );
  const [laneCenterXById, setLaneCenterXById] = useState<Map<string, number>>(
    new Map()
  );
  const [epochGapLayouts, setEpochGapLayouts] = useState<Map<string, MeasuredRowEntry>>(
    new Map()
  );
  const [lanePlaneWidth, setLanePlaneWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  /** Measure all card positions and lane button centers. */
  const measureLayouts = useCallback(() => {
    const nextCards = new Map<SceneId, CardLayoutEntry>();
    cardWrapperRefs.current.forEach((el: HTMLDivElement, id: SceneId) => {
      nextCards.set(id, {
        x: el.offsetLeft,
        y: el.offsetTop,
        w: el.offsetWidth,
        h: el.offsetHeight,
      });
    });
    setCardLayouts(nextCards);

    const nextEpochGapLayouts = new Map<string, MeasuredRowEntry>();
    epochGapRefs.current.forEach((el: HTMLDivElement, key: string) => {
      nextEpochGapLayouts.set(key, {
        y: el.offsetTop,
        h: el.offsetHeight,
      });
    });
    setEpochGapLayouts(nextEpochGapLayouts);

    const laneTrackRect = laneTrackRef.current?.getBoundingClientRect();
    const nextCenters = new Map<string, number>();
    laneButtonRefs.current.forEach((el: HTMLButtonElement, id: string) => {
      if (laneTrackRect) {
        const rect = el.getBoundingClientRect();
        nextCenters.set(id, rect.left - laneTrackRect.left + rect.width / 2);
      } else {
        nextCenters.set(id, el.offsetLeft + el.offsetWidth / 2);
      }
    });
    setLaneCenterXById(nextCenters);
    setLanePlaneWidth(
      laneTrackRef.current?.scrollWidth ?? laneTrackRef.current?.offsetWidth ?? 0
    );
    setViewportHeight(innerContainerRef.current?.clientHeight ?? 0);
  }, [laneButtonRefs]);

  useLayoutEffect(() => {
    measureLayouts();
  }, [sortedScenes, visibleLaneEntryIds, measureLayouts]);

  // Re-measure after the browser has painted to catch any deferred CSS layout
  // settlement (e.g. flex gap, font-triggered reflow) that may cause offsetTop
  // to be stale during the synchronous useLayoutEffect above.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      measureLayouts();
    });
    return () => cancelAnimationFrame(raf);
  }, [sortedScenes, visibleLaneEntryIds, measureLayouts]);

  useEffect(() => {
    const el = innerContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureLayouts);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureLayouts]);

  // -------------------------------------------------------------------------
  // Snake path data (computed from measured layouts)
  // -------------------------------------------------------------------------

  const snakePaths = useMemo(() => {
    return visibleLaneEntryIds.map((entryId: string) => {
      const centerX = laneCenterXById.get(entryId);
      if (centerX === undefined) return null;

      // Scenes belonging to this lane, sorted by the entry's personal timeline.
      // For each scene: check tag_personal_datetimes for this entry, else use scene_time.
      // Scenes without any temporal anchor go to the end.
      const entryScenes = sortedScenes.filter((s: Scene) =>
        markerStyleBySceneId.get(s.id)?.has(entryId)
      );
      const sourceEntry = sourcebookEntries.find(
        (e: SourcebookEntry) => e.id === entryId
      );
      const getPersonalAge = (s: Scene): string | null => {
        const tagDts = s.tag_personal_datetimes ?? [];
        const sbMatch = tagDts.find(
          (t: SceneTagPersonalDatetime) => t.role === 'sourcebook' && t.ref === entryId
        );
        if (sbMatch) return sbMatch.personal_age;
        if (sourceEntry) {
          const charMatch = tagDts.find(
            (t: SceneTagPersonalDatetime) =>
              (t.role === 'active' || t.role === 'passive') &&
              t.ref === sourceEntry.name
          );
          if (charMatch) return charMatch.personal_age;
        }
        return null;
      };
      const proseScenes = [...entryScenes].sort((a: Scene, b: Scene) => {
        const ta = getPersonalAge(a);
        const tb = getPersonalAge(b);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      });

      const { pathData, sceneXById } = buildSnakePath(
        proseScenes,
        cardLayouts,
        centerX
      );

      return { entryId, pathData, proseScenes, sceneXById };
    });
  }, [
    visibleLaneEntryIds,
    laneCenterXById,
    sortedScenes,
    markerStyleBySceneId,
    cardLayouts,
    sourcebookEntries,
  ]);

  // -------------------------------------------------------------------------
  // Time travel arrows for the left timeline panel
  // -------------------------------------------------------------------------

  type TimeTravelArrow = {
    pathData: string;
    markerEnd?: string;
    goingDown: boolean;
    entryName: string;
    createsNewTimeline: boolean;
    sourceX: number;
    destinationX: number;
    depY: number;
    destY: number;
  };
  const timelinePanelModel = useMemo(
    () =>
      buildTimelinePanelModel(
        sortedScenes,
        sourcebookEntries,
        sceneEpochNanosecondsById
      ),
    [sortedScenes, sourcebookEntries, sceneEpochNanosecondsById]
  );

  const timelineLaneStartYByNumber = useMemo(() => {
    const starts = new Map<number, number>();

    sortedScenes.forEach((scene: Scene): void => {
      const layout = cardLayouts.get(scene.id);
      if (!layout) return;
      const cy = layout.y + layout.h / 2;
      const lane = timelinePanelModel.laneBySceneId.get(scene.id) ?? 0;
      const prev = starts.get(lane);
      if (prev === undefined || cy < prev) {
        starts.set(lane, cy);
      }
    });

    timelinePanelModel.events.forEach((event: TimelineJumpEvent): void => {
      if (!event.createsNewTimeline) return;
      if (event.destinationEpochNs === null) return;

      const startY =
        event.destinationSceneId !== null
          ? (() => {
              const sceneLayout = cardLayouts.get(event.destinationSceneId);
              return sceneLayout ? getLayoutCenterY(sceneLayout) : null;
            })()
          : (() => {
              const gap = epochGapLayouts.get(event.destinationEpochNs.toString());
              return gap ? getLayoutCenterY(gap) : null;
            })();
      if (startY === null) return;

      const prev = starts.get(event.destinationLane);
      if (prev === undefined || startY < prev) {
        starts.set(event.destinationLane, startY);
      }
    });

    return starts;
  }, [timelinePanelModel.events, sortedScenes, cardLayouts, epochGapLayouts]);

  const timelineLaneXByNumber = useMemo(() => {
    const map = new Map<number, number>();
    timelinePanelModel.laneNumbers.forEach((lane: number) => {
      map.set(lane, TL_LANE_START_X + lane * TL_LANE_GAP);
    });
    return map;
  }, [timelinePanelModel.laneNumbers]);

  const timelinePanelWidth = useMemo(() => {
    const maxLaneNumber = Math.max(0, ...timelinePanelModel.laneNumbers);
    const rightMostLaneX = TL_LANE_START_X + maxLaneNumber * TL_LANE_GAP;
    return rightMostLaneX + TL_MAX_LOOP_W + TL_RIGHT_PAD;
  }, [timelinePanelModel.laneNumbers]);

  const timelineSpawns = useMemo((): Map<number, number | null> => {
    const spawns = new Map<number, number | null>();
    spawns.set(0, null);

    timelinePanelModel.events.forEach((ev: TimelineJumpEvent): void => {
      if (!ev.createsNewTimeline || ev.destinationEpochNs === null) return;

      const measuredGap = epochGapLayouts.get(ev.destinationEpochNs.toString());
      if (measuredGap !== undefined) {
        spawns.set(ev.destinationLane, getLayoutCenterY(measuredGap));
        return;
      }

      const spawnY =
        ev.destinationSceneId !== null
          ? (() => {
              const layout = cardLayouts.get(ev.destinationSceneId);
              return layout ? getLayoutCenterY(layout) : null;
            })()
          : null; // gap row not yet measured
      spawns.set(ev.destinationLane, spawnY);
    });

    return spawns;
  }, [timelinePanelModel.events, cardLayouts, epochGapLayouts]);

  /** Maps each spawned branch lane → the source lane that created it. */
  const timelineSpawnParentLane = useMemo((): Map<number, number> => {
    const map = new Map<number, number>();
    timelinePanelModel.events.forEach((ev: TimelineJumpEvent): void => {
      if (!ev.createsNewTimeline) return;
      if (!map.has(ev.destinationLane)) {
        map.set(ev.destinationLane, ev.sourceLane);
      }
    });
    return map;
  }, [timelinePanelModel.events]);

  // For branch-creation jumps that land on an actual destination scene, place
  // that scene dot on the horizontal spawn segment so the arrow can terminate
  // directly on the dot (special case like 19->17 in the sketch).
  const timelineSceneDotXOverrides = useMemo((): Map<SceneId, number> => {
    const overrides = new Map<SceneId, number>();

    timelinePanelModel.events.forEach((ev: TimelineJumpEvent): void => {
      if (!ev.createsNewTimeline) return;
      if (ev.destinationSceneId === null) return;

      const sourceX = timelineLaneXByNumber.get(ev.sourceLane);
      const destinationLaneX = timelineLaneXByNumber.get(ev.destinationLane);
      if (sourceX === undefined || destinationLaneX === undefined) return;

      overrides.set(ev.destinationSceneId, (sourceX + destinationLaneX) / 2);
    });

    return overrides;
  }, [timelinePanelModel.events, timelineLaneXByNumber]);

  const timeTravelArrows = useMemo((): TimeTravelArrow[] => {
    const arrows: TimeTravelArrow[] = [];

    timelinePanelModel.events.forEach((ev: TimelineJumpEvent): void => {
      const sourceX = timelineLaneXByNumber.get(ev.sourceLane);
      if (sourceX === undefined) return;

      // Departure point
      const depY =
        ev.departureSceneId !== null
          ? (() => {
              const sceneLayout = cardLayouts.get(ev.departureSceneId);
              return sceneLayout ? sceneLayout.y + sceneLayout.h / 2 : null;
            })()
          : (() => {
              const gap = epochGapLayouts.get(ev.departureEpochNs.toString());
              return gap ? getLayoutCenterY(gap) : null;
            })();
      if (depY === null) return;

      // Determine destination point
      let destX = sourceX;
      let destY: number | null = null;
      const destinationLaneX = timelineLaneXByNumber.get(ev.destinationLane) ?? sourceX;

      if (ev.createsNewTimeline && ev.destinationEpochNs !== null) {
        // Branching case: target the split height on the spawned timeline.
        const spawnY = timelineSpawns.get(ev.destinationLane);

        if (spawnY != null) {
          if (ev.destinationSceneId !== null) {
            // Special case: when the destination scene exists exactly at the
            // branch spawn point, terminate at the marker border so the arrow
            // points to the dot, not to the horizontal spawn line.
            const goingDown = spawnY >= depY;
            destY = spawnY + (goingDown ? -TL_DOT_R : TL_DOT_R);
          } else {
            destY = spawnY;
          }
        } else if (ev.destinationSceneId !== null) {
          // Scene exists at destination — use its Y as the arrival point
          const sceneLayout = cardLayouts.get(ev.destinationSceneId);
          destY = sceneLayout ? sceneLayout.y + sceneLayout.h / 2 : null;
        } else {
          // No gap row measured yet for this epoch.
          destY = null;
        }
        destX = destinationLaneX;
      } else {
        // Non-branching case: point at destination scene or stay on source lane
        if (ev.destinationSceneId !== null) {
          const sceneLayout = cardLayouts.get(ev.destinationSceneId);
          if (sceneLayout) {
            const centerY = sceneLayout.y + sceneLayout.h / 2;
            // Vertical arrivals: stop at top/bottom edge of dot.
            // Same-lane backward (horizontal arrival) offset is applied at draw time.
            const isSameLaneBwd =
              ev.sourceLane === ev.destinationLane && centerY < depY;
            destY = isSameLaneBwd
              ? centerY
              : centerY + (centerY >= depY ? -TL_DOT_R : TL_DOT_R);
            destX = sourceX;
          } else {
            destY = null;
            destX = sourceX;
          }
        } else if (ev.destinationEpochNs !== null) {
          // Use the measured epoch-gap row position.
          const gap = epochGapLayouts.get(ev.destinationEpochNs.toString());
          destY = gap ? getLayoutCenterY(gap) : null;
          destX = sourceX;
        } else {
          destY = depY - 20;
          destX = sourceX;
        }
      }

      if (destY === null) return;
      if (Math.abs(destY - depY) < 2 && sourceX === destX) return;

      let pathData: string;
      let markerEnd: string;

      if (ev.createsNewTimeline && ev.destinationEpochNs !== null) {
        const geometry = buildBranchCreationArrowGeometry(
          sourceX,
          depY,
          destinationLaneX,
          destY
        );
        pathData = geometry.pathData;
        markerEnd = destY > depY ? 'url(#tl-arrow-down)' : 'url(#tl-arrow-up)';

        arrows.push({
          pathData,
          markerEnd,
          goingDown: destY > depY,
          entryName: ev.entryName,
          createsNewTimeline: ev.createsNewTimeline,
          sourceX,
          destinationX: geometry.endX,
          depY,
          destY: geometry.endY,
        });
        return;
      }

      const loopX = ev.createsNewTimeline
        ? Math.max(
            sourceX,
            timelineLaneXByNumber.get(ev.destinationLane) ?? sourceX + TL_LANE_GAP
          ) + TL_LOOP_W_CROSS
        : getTimeTravelLoopX(sourceX, destX, depY, destY);

      if (sourceX === destX && destY > depY) {
        // Same-lane forward travel remains on the timeline.
        pathData = `M ${sourceX},${depY} L ${destX},${destY}`;
        markerEnd = 'url(#tl-arrow-down)';
      } else {
        // Backward jumps and cross-lane jumps use a side-channel loop.
        const isSameLaneBackward = sourceX === destX && destY < depY;
        // For same-lane backward jumps with a known destination scene the path arrives
        // horizontally; shift the endpoint to the right edge of the destination dot.
        const drawDestX =
          isSameLaneBackward && ev.destinationSceneId !== null
            ? destX + TL_DOT_R
            : destX;
        const geometry = buildTimeTravelArrowGeometry(
          sourceX,
          depY,
          drawDestX,
          destY,
          loopX
        );
        pathData = geometry.pathData;
        // Same-lane backward jumps arrive horizontally from the right side-channel;
        // all other loops arrive vertically.
        markerEnd =
          destY > depY
            ? 'url(#tl-arrow-down)'
            : isSameLaneBackward
              ? 'url(#tl-arrow-left)'
              : 'url(#tl-arrow-up)';
      }

      arrows.push({
        pathData,
        markerEnd,
        goingDown: destY > depY,
        entryName: ev.entryName,
        createsNewTimeline: ev.createsNewTimeline,
        sourceX,
        destinationX: destX,
        depY,
        destY,
      });
    });

    return arrows;
  }, [
    timelinePanelModel.events,
    cardLayouts,
    epochGapLayouts,
    timelineLaneXByNumber,
    timelineSpawns,
  ]);

  const timelineSceneAreaHeight = useMemo(() => {
    let maxBottom = 0;
    cardLayouts.forEach((layout: CardLayoutEntry): void => {
      maxBottom = Math.max(maxBottom, layout.y + layout.h);
    });
    return Math.ceil(maxBottom + 8);
  }, [cardLayouts]);

  const timelineOverlayHeight = Math.max(timelineSceneAreaHeight, viewportHeight);
  const cardsLeftPadding = timelinePanelWidth + 4;

  const placeholderRowHeight = useMemo((): number => {
    const heights = Array.from(cardLayouts.values()).map(
      (layout: CardLayoutEntry): number => layout.h
    );
    if (heights.length === 0) {
      return DEFAULT_PLACEHOLDER_ROW_HEIGHT;
    }
    const sortedHeights = [...heights].sort((a: number, b: number) => a - b);
    const middle = Math.floor(sortedHeights.length / 2);
    const median =
      sortedHeights.length % 2 === 1
        ? sortedHeights[middle]
        : (sortedHeights[middle - 1] + sortedHeights[middle]) / 2;
    return Math.max(40, Math.round(median));
  }, [cardLayouts]);

  /** All distinct epochs referenced by time-travel events that do not coincide
   *  with an actual scene row.  Each gets a blank gap row so arrows can anchor
   *  to a concrete DOM position without interpolation. */
  const gapEpochs = useMemo((): bigint[] => {
    const sceneEpochSet = new Set<bigint>();
    sortedScenes.forEach((scene: Scene) => {
      const ns = sceneEpochNanosecondsById.get(scene.id);
      if (ns !== undefined) sceneEpochSet.add(ns);
    });
    const seen = new Set<bigint>();
    const result: bigint[] = [];
    timelinePanelModel.events.forEach((ev: TimelineJumpEvent) => {
      const candidates: (bigint | null)[] = [
        ev.departureSceneId === null ? ev.departureEpochNs : null,
        ev.destinationSceneId === null && ev.destinationEpochNs !== null
          ? ev.destinationEpochNs
          : null,
      ];
      candidates.forEach((ns: bigint | null) => {
        if (ns !== null && !sceneEpochSet.has(ns) && !seen.has(ns)) {
          seen.add(ns);
          result.push(ns);
        }
      });
    });
    return result.sort((a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0));
  }, [timelinePanelModel.events, sortedScenes, sceneEpochNanosecondsById]);

  type TimelineListRow =
    | { kind: 'scene'; scene: Scene }
    | { kind: 'epoch-gap'; key: string; epochNs: bigint };

  const timelineListRows = useMemo((): TimelineListRow[] => {
    const rows: TimelineListRow[] = [];
    let gapIndex = 0;

    sortedScenes.forEach((scene: Scene, index: number): void => {
      const sceneEpoch = sceneEpochNanosecondsById.get(scene.id) ?? null;
      const previousScene = index > 0 ? sortedScenes[index - 1] : null;
      const previousEpoch =
        previousScene !== null
          ? (sceneEpochNanosecondsById.get(previousScene.id) ?? null)
          : null;

      while (gapIndex < gapEpochs.length) {
        const gapEpoch = gapEpochs[gapIndex];
        const afterPrevious = previousEpoch === null || gapEpoch > previousEpoch;
        const beforeCurrent = sceneEpoch !== null && gapEpoch <= sceneEpoch;
        if (afterPrevious && beforeCurrent) {
          rows.push({
            kind: 'epoch-gap',
            key: `epoch-gap-${gapEpoch.toString()}`,
            epochNs: gapEpoch,
          });
          gapIndex += 1;
          continue;
        }
        break;
      }

      rows.push({ kind: 'scene', scene });
    });

    while (gapIndex < gapEpochs.length) {
      rows.push({
        kind: 'epoch-gap',
        key: `epoch-gap-${gapEpochs[gapIndex].toString()}`,
        epochNs: gapEpochs[gapIndex],
      });
      gapIndex += 1;
    }

    return rows;
  }, [gapEpochs, sortedScenes, sceneEpochNanosecondsById]);

  // -------------------------------------------------------------------------
  // Bottom scroller sync (same as NarrativeView)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!bottomLaneScrollRef.current) return;
    const el = bottomLaneScrollRef.current;
    if (Math.abs(el.scrollLeft - laneScrollLeft) > 1) {
      el.scrollLeft = laneScrollLeft;
    }
  }, [laneScrollLeft]);

  const handleBottomLaneScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>): void => {
      setLaneScrollLeft(e.currentTarget.scrollLeft);
    },
    [setLaneScrollLeft]
  );

  // -------------------------------------------------------------------------
  // Theme classes
  // -------------------------------------------------------------------------

  const bgClass = isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-950';
  const trackColor = isLight ? '#6366f1' : '#a5b4fc';
  const solidFill = isLight ? '#6366f1' : '#a5b4fc';
  const hollowFill = isLight ? '#f8fafc' : '#0f172a';
  const solidStroke = solidFill;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      ref={rootRef}
      className={`w-full h-full flex flex-col ${bgClass}`}
      role="region"
      aria-label={t('Convergence Map')}
    >
      {/* Sticky lane header */}
      <div
        className={`sticky top-0 z-30 border-b ${isLight ? 'border-brand-gray-200 bg-brand-gray-50' : 'border-brand-gray-800 bg-brand-gray-950'}`}
      >
        <div
          className="overflow-hidden px-3 pt-2 pb-2"
          style={{ paddingLeft: `${cardsLeftPadding}px` }}
        >
          <LaneHeader lanes={lanes} laneTrackRef={laneTrackRef} />
        </div>
      </div>

      {/* Scrollable content: snake overlay behind full-width cards */}
      <div
        ref={innerContainerRef}
        className="relative flex-1 overflow-y-auto"
        role="presentation"
        tabIndex={-1}
        onMouseDown={handleBackgroundMouseDown}
        onKeyDown={() => {}}
      >
        {/* Snake SVG overlay — ABOVE the cards, pointer-events-none so cards stay clickable */}
        <div
          className="pointer-events-none absolute left-0 top-0 z-20 overflow-hidden"
          style={{
            height: timelineOverlayHeight > 0 ? `${timelineOverlayHeight}px` : '100%',
          }}
        >
          <div
            className="relative h-full"
            style={{
              width: lanePlaneWidth > 0 ? `${lanePlaneWidth}px` : '100%',
              transform: `translateX(${-laneScrollLeft}px)`,
            }}
          >
            <svg
              width={lanePlaneWidth || '100%'}
              height={timelineOverlayHeight > 0 ? timelineOverlayHeight : '100%'}
              className="absolute inset-0"
              style={{ overflow: 'visible', userSelect: 'none' }}
            >
              {snakePaths.map((sp: (typeof snakePaths)[number]) => {
                if (!sp || !sp.pathData) return null;
                const { entryId, pathData, proseScenes, sceneXById } = sp;

                return (
                  <g key={entryId} transform={`translate(${cardsLeftPadding},0)`}>
                    {/* Snake track */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={trackColor}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.7}
                    />
                    {/* Scene nodes on the snake */}
                    {proseScenes.map((scene: Scene) => {
                      const cx = sceneXById.get(scene.id);
                      const layout = cardLayouts.get(scene.id);
                      if (cx === undefined || !layout) return null;
                      const cy = layout.y + layout.h / 2;
                      const markerStyle = markerStyleBySceneId
                        .get(scene.id)
                        ?.get(entryId);
                      const isSolid = markerStyle === 'solid';
                      const isPrimary = primarySelectedSceneId === scene.id;
                      return (
                        <circle
                          key={scene.id}
                          cx={cx}
                          cy={cy}
                          r={isPrimary ? SCENE_CIRCLE_R + 2 : SCENE_CIRCLE_R}
                          fill={isSolid ? solidFill : hollowFill}
                          stroke={solidStroke}
                          strokeWidth={isPrimary ? 2.5 : 1.5}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Left chronological timeline panel */}
        <div
          className="pointer-events-none absolute left-0 top-0 z-20 overflow-hidden"
          style={{
            width: timelinePanelWidth,
            height: timelineOverlayHeight > 0 ? `${timelineOverlayHeight}px` : '100%',
          }}
        >
          <svg
            width={timelinePanelWidth}
            height={timelineOverlayHeight > 0 ? timelineOverlayHeight : '100%'}
            style={{ overflow: 'visible', userSelect: 'none' }}
            aria-hidden="true"
          >
            {/* Vertical track lines for all timelines */}
            {timelinePanelModel.laneNumbers.map((laneNumber: number) => {
              const laneX = timelineLaneXByNumber.get(laneNumber);
              if (laneX === undefined) return null;

              // Determine where the line should start.
              let lineStartY: number | undefined;

              if (laneNumber === 0) {
                // Main timeline exists for the full visible chronology.
                lineStartY = 0;
              } else {
                // Branched timelines only exist from their spawn onward.
                const spawnY = timelineSpawns.get(laneNumber);
                if (spawnY !== null && spawnY !== undefined) {
                  lineStartY = spawnY;
                } else {
                  lineStartY = timelineLaneStartYByNumber.get(laneNumber);
                }
              }

              // Skip rendering if no anchor exists.
              if (lineStartY === undefined) return null;

              const lineEndY = Math.max(timelineOverlayHeight, lineStartY + 1);

              if (laneNumber !== 0) {
                const spawnY = timelineSpawns.get(laneNumber);
                if (spawnY !== null && spawnY !== undefined) {
                  const parentLane = timelineSpawnParentLane.get(laneNumber) ?? 0;
                  const parentLaneX =
                    timelineLaneXByNumber.get(parentLane) ?? laneX - TL_LANE_GAP;
                  const spawnedPath = buildSpawnedTimelineTrackPath(
                    parentLaneX,
                    laneX,
                    spawnY,
                    lineEndY
                  );

                  return (
                    <path
                      key={`lane-track-${laneNumber}`}
                      d={spawnedPath}
                      fill="none"
                      stroke={trackColor}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.7}
                    />
                  );
                }
              }

              return (
                <line
                  key={`lane-track-${laneNumber}`}
                  x1={laneX}
                  y1={lineStartY}
                  x2={laneX}
                  y2={lineEndY}
                  stroke={trackColor}
                  strokeWidth={2}
                  opacity={0.7}
                />
              );
            })}
            {/* Scene position dots */}
            {sortedScenes.map((scene: Scene) => {
              const layout = cardLayouts.get(scene.id);
              const lane = timelinePanelModel.laneBySceneId.get(scene.id) ?? 0;
              const laneX = timelineLaneXByNumber.get(lane);
              if (!layout) return null;
              if (laneX === undefined) return null;
              const overriddenX = timelineSceneDotXOverrides.get(scene.id);
              const cy = layout.y + layout.h / 2;
              return (
                <circle
                  key={scene.id}
                  cx={overriddenX ?? laneX}
                  cy={cy}
                  r={TL_DOT_R}
                  fill={solidFill}
                  opacity={0.8}
                />
              );
            })}
            {/* Time travel arrows */}
            <defs>
              <marker
                id="tl-arrow-down"
                markerWidth="6"
                markerHeight="5"
                refX="5"
                refY="2.5"
                orient="90"
              >
                <polygon points="0 0, 6 2.5, 0 5" fill={trackColor} />
              </marker>
              <marker
                id="tl-arrow-up"
                markerWidth="6"
                markerHeight="5"
                refX="5"
                refY="2.5"
                orient="270"
              >
                <polygon points="0 0, 6 2.5, 0 5" fill={trackColor} />
              </marker>
              <marker
                id="tl-arrow-left"
                markerWidth="6"
                markerHeight="5"
                refX="5"
                refY="2.5"
                orient="180"
              >
                <polygon points="0 0, 6 2.5, 0 5" fill={trackColor} />
              </marker>
            </defs>
            {timeTravelArrows.map((arrow: TimeTravelArrow, i: number) => (
              <g key={i}>
                {/* Dot at departure point */}
                <circle
                  cx={arrow.sourceX}
                  cy={arrow.depY}
                  r={3}
                  fill={trackColor}
                  opacity={0.85}
                />
                {/* Arrow path with new semantics */}
                <path
                  d={arrow.pathData}
                  fill="none"
                  stroke={trackColor}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd={arrow.markerEnd}
                  opacity={0.85}
                />
              </g>
            ))}
          </svg>
        </div>

        {/* Scene cards — full-width vertical list, exactly like Chronological view */}
        <div
          className="relative z-10 flex flex-col gap-2 p-3"
          style={{ paddingLeft: `${cardsLeftPadding}px` }}
        >
          {timelineListRows.map((row: TimelineListRow) => {
            if (row.kind === 'epoch-gap') {
              const key = row.epochNs.toString();
              return (
                <div
                  key={row.key}
                  ref={(el: HTMLDivElement | null) => {
                    if (el) {
                      epochGapRefs.current.set(key, el);
                    } else {
                      epochGapRefs.current.delete(key);
                    }
                  }}
                  aria-hidden="true"
                  className="w-full"
                  style={{ height: placeholderRowHeight }}
                />
              );
            }

            const scene = row.scene;
            const idx = sceneIndexMap.get(scene.id) ?? 0;
            return (
              <div
                key={scene.id}
                ref={(el: HTMLDivElement | null) => {
                  if (el) {
                    cardWrapperRefs.current.set(scene.id, el);
                  } else {
                    cardWrapperRefs.current.delete(scene.id);
                  }
                }}
              >
                <SceneCard
                  scene={scene}
                  index={idx}
                  variant="narrative"
                  onSelect={handleCardSelect}
                  onEdit={onEditScene ?? (() => {})}
                  isSelected={selectedSceneIds.has(scene.id)}
                  isActive={activeSceneId === scene.id}
                  isCause={causeIds.has(scene.id)}
                  isEffect={effectIds.has(scene.id)}
                />
              </div>
            );
          })}
          {sortedScenes.length === 0 && (
            <p
              className={`text-sm text-center py-8 ${isLight ? 'text-brand-gray-400' : 'text-brand-gray-500'}`}
            >
              {selectedLaneEntryIds.size > 0
                ? t('No scenes match the selected entries')
                : t('No scenes yet')}
            </p>
          )}
        </div>
      </div>

      {/* Bottom lane horizontal scrollbar */}
      <div
        className={`border-t px-3 py-1 ${isLight ? 'border-brand-gray-200 bg-brand-gray-50' : 'border-brand-gray-800 bg-brand-gray-950'}`}
      >
        <div
          ref={bottomLaneScrollRef}
          className="overflow-x-auto overflow-y-hidden"
          onScroll={handleBottomLaneScroll}
          aria-label={t('Lane horizontal scrollbar')}
        >
          <div style={{ width: lanePlaneWidth, height: 1 }} />
        </div>
      </div>
    </div>
  );
};
/* eslint-enable complexity */
