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
import { parseZonedDateTime } from '../../utils/temporal';

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
const TIMELINE_W = 52; // px — width of left chronological timeline panel
const TL_TRACK_X = 8; // px — X of main vertical track within panel
const TL_DOT_R = 4; // px — radius of scene dots on timeline
const TL_LOOP_W = 36; // px — horizontal reach of time travel loop arrows (bows RIGHT)
const TL_CORNER_R = 6; // px — rounded corner radius on loop arrows

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

type CardLayoutEntry = { x: number; y: number; w: number; h: number };

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
function buildTimeTravelArrowPath(depY: number, destY: number): string {
  const rx = TL_TRACK_X + TL_LOOP_W; // rightmost X of the loop
  const cr = TL_CORNER_R;
  const goingDown = destY >= depY;

  if (goingDown) {
    // Arrow: departs rightward, goes down on the right side, arrives at destY
    return [
      `M ${TL_TRACK_X},${depY}`,
      `L ${rx - cr},${depY}`,
      `a ${cr},${cr} 0 0 1 ${cr},${cr}`,
      `L ${rx},${destY - cr}`,
      `a ${cr},${cr} 0 0 1 ${-cr},${cr}`,
      `L ${TL_TRACK_X},${destY}`,
    ].join(' ');
  } else {
    // Arrow: departs rightward, goes up on the right side, arrives at destY
    return [
      `M ${TL_TRACK_X},${depY}`,
      `L ${rx - cr},${depY}`,
      `a ${cr},${cr} 0 0 0 ${cr},${-cr}`,
      `L ${rx},${destY + cr}`,
      `a ${cr},${cr} 0 0 0 ${-cr},${-cr}`,
      `L ${TL_TRACK_X},${destY}`,
    ].join(' ');
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/* eslint-disable complexity */
// Intentionally kept as one component to keep map layout and overlay geometry together.
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

  const [cardLayouts, setCardLayouts] = useState<Map<SceneId, CardLayoutEntry>>(
    new Map()
  );
  const [laneCenterXById, setLaneCenterXById] = useState<Map<string, number>>(
    new Map()
  );
  const [lanePlaneWidth, setLanePlaneWidth] = useState(0);

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
    goingDown: boolean;
    entryName: string;
    createsNewTimeline: boolean;
    depY: number;
    destY: number;
  };
  const timeTravelArrows = useMemo((): TimeTravelArrow[] => {
    const arrows: TimeTravelArrow[] = [];
    const ttEntries = sourcebookEntries.filter(
      (e: SourcebookEntry) => e.category === 'Time Travel'
    );

    ttEntries.forEach((entry: SourcebookEntry): void => {
      // Find departure scene(s): scenes that include this entry in sourcebook_entry_ids
      const depScenes = sortedScenes.filter((s: Scene) =>
        (s.sourcebook_entry_ids ?? []).includes(entry.id)
      );
      if (depScenes.length === 0) return;

      // Find destination Y: scene whose scene_time is closest to destination_datetime
      let destScene: Scene | null = null;
      if (entry.destination_datetime) {
        // Use parseZonedDateTime so Temporal-annotated formats (e.g. [UTC][u-ca=gregory])
        // are handled correctly — Date.parse returns NaN for these strings.
        const destParsed = parseZonedDateTime(entry.destination_datetime);
        if (destParsed !== null) {
          const destNsVal = destParsed.epochNanoseconds;
          let minDiff = BigInt('99999999999999999999');
          sortedScenes.forEach((s: Scene): void => {
            const sNs = sceneEpochNanosecondsById.get(s.id);
            if (sNs === undefined) return;
            const diff = sNs > destNsVal ? sNs - destNsVal : destNsVal - sNs;
            if (diff < minDiff) {
              minDiff = diff;
              destScene = s;
            }
          });
        }
      }

      depScenes.forEach((depScene: Scene): void => {
        const depLayout = cardLayouts.get(depScene.id);
        if (!depLayout) return;
        const depY = depLayout.y + depLayout.h / 2;

        let destY: number;
        if (destScene) {
          const destLayout = cardLayouts.get((destScene as Scene).id);
          if (!destLayout) return;
          destY = destLayout.y + destLayout.h / 2;
        } else {
          // No destination datetime: draw a small self-loop arrow at departure
          destY = depY - 20;
        }

        if (Math.abs(destY - depY) < 4) return; // skip trivial arrows
        arrows.push({
          pathData: buildTimeTravelArrowPath(depY, destY),
          goingDown: destY > depY,
          entryName: entry.name,
          createsNewTimeline: !!entry.creates_new_timeline,
          depY,
          destY,
        });
      });
    });
    return arrows;
  }, [sourcebookEntries, sortedScenes, cardLayouts, sceneEpochNanosecondsById]);

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
  // Highlight color for "creates new timeline" fork indicators
  const forkColor = isLight ? '#f59e0b' : '#fbbf24';

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
        <div className="overflow-hidden px-3 pt-2 pb-2">
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
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          <div
            className="relative h-full"
            style={{
              width: lanePlaneWidth > 0 ? `${lanePlaneWidth}px` : '100%',
              transform: `translateX(${-laneScrollLeft}px)`,
            }}
          >
            <svg
              width={lanePlaneWidth || '100%'}
              height="100%"
              className="absolute inset-0"
              style={{ overflow: 'visible', userSelect: 'none' }}
            >
              {snakePaths.map((sp: (typeof snakePaths)[number]) => {
                if (!sp || !sp.pathData) return null;
                const { entryId, pathData, proseScenes, sceneXById } = sp;

                return (
                  <g key={entryId}>
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
          className="pointer-events-none absolute left-0 top-0 bottom-0 z-20 overflow-hidden"
          style={{ width: TIMELINE_W }}
        >
          <svg
            width={TIMELINE_W}
            height="100%"
            style={{ overflow: 'visible', userSelect: 'none' }}
            aria-hidden="true"
          >
            {/* Vertical track line */}
            <line
              x1={TL_TRACK_X}
              y1={0}
              x2={TL_TRACK_X}
              y2="100%"
              stroke={trackColor}
              strokeWidth={1.5}
              opacity={0.4}
            />
            {/* Scene position dots */}
            {sortedScenes.map((scene: Scene) => {
              const layout = cardLayouts.get(scene.id);
              if (!layout) return null;
              const cy = layout.y + layout.h / 2;
              return (
                <circle
                  key={scene.id}
                  cx={TL_TRACK_X}
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
                id="tl-arrow"
                markerWidth="6"
                markerHeight="5"
                refX="5"
                refY="2.5"
                orient="auto"
              >
                <polygon points="0 0, 6 2.5, 0 5" fill={trackColor} />
              </marker>
            </defs>
            {timeTravelArrows.map((arrow: TimeTravelArrow, i: number) => (
              <path
                key={i}
                d={arrow.pathData}
                fill="none"
                stroke={trackColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#tl-arrow)"
                opacity={0.85}
              />
            ))}
            {/* Fork indicators: prominent diamond + branch line when creates_new_timeline=true */}
            {timeTravelArrows
              .filter((a: TimeTravelArrow) => a.createsNewTimeline)
              .map((arrow: TimeTravelArrow, i: number) => {
                const cx = TL_TRACK_X;
                // Fork marker sits at the destination (arrival point in the past)
                const y = arrow.destY;
                // Diamond (rhombus) centered on the departure dot, pointing right
                const dw = 7; // half-width (horizontal)
                const dh = 5; // half-height (vertical)
                const diamondPoints = [
                  `${cx},${y - dh}`,
                  `${cx + dw},${y}`,
                  `${cx},${y + dh}`,
                  `${cx - dw},${y}`,
                ].join(' ');
                // Short dashed branch line from diamond tip toward right edge
                const branchX1 = cx + dw;
                const branchX2 = TIMELINE_W - 4;
                return (
                  <g key={`fork-${i}`}>
                    {/* Dashed branch line extending right from the diamond */}
                    <line
                      x1={branchX1}
                      y1={y}
                      x2={branchX2}
                      y2={y}
                      stroke={forkColor}
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      strokeLinecap="round"
                      opacity={0.9}
                    />
                    {/* Filled amber diamond marking the branch departure */}
                    <polygon points={diamondPoints} fill={forkColor} opacity={0.95} />
                  </g>
                );
              })}
          </svg>
        </div>

        {/* Scene cards — full-width vertical list, exactly like Chronological view */}
        <div
          className="relative z-10 flex flex-col gap-2 p-3"
          style={{ paddingLeft: `${TIMELINE_W + 4}px` }}
        >
          {sortedScenes.map((scene: Scene) => {
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
