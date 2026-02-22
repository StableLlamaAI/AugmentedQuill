# Projects and Settings

To access your projects and configure the application, click the **Settings** icon (or the logo/title area) in the top navigation bar. This opens the Settings Dialog, which has two main tabs: **Projects** and **Machine Settings**.

## The Projects Tab

The Projects tab is where you manage your stories.

`[SCREENSHOT: The Settings Dialog showing the Projects tab with a list of projects]`

Here you can:

- **Create a New Project**: Start a new story from scratch.
- **Load Project**: Open an existing story.
- **Rename Project**: Change the name of your project.
- **Delete Project**: Remove a project you no longer need.
- **Import/Convert**: Bring in stories from other formats.

## The Machine Settings Tab

The Machine Settings tab is where you configure the AI models that power AugmentedQuill. You can add different AI providers (like OpenAI, Anthropic, or local models) and assign them to specific tasks.

`[SCREENSHOT: The Settings Dialog showing the Machine Settings tab with the three AI model assignments]`

### The Three AI Models

AugmentedQuill uses three distinct AI models, each optimized for a specific part of the writing process. You can assign different providers to each model based on their strengths. The application uses color hints to help you identify which model is currently active.

1. **WRITING Model (Violet)**
   - **Icon**: <img src="https://cdn.jsdelivr.net/npm/lucide-static@1.0.0/icons/book-open.svg" alt="Book Open icon" width="20" height="20" style="vertical-align:middle;" /> Book Open
   - **Color Hint**: <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:16px;height:16px;border-radius:3px;border:1px solid #c4b5fd;background:#ede9fe;"></span><span style="color:#6d28d9;font-weight:600;">Violet</span></span> (background #ede9fe, text #6d28d9)
   - **Purpose**: Generating new text, continuing the story, and expanding on ideas.
   - **Capabilities**: This model is called when you ask the AI to "Continue" writing from where you left off, or when you generate a new scene from scratch. It focuses on creativity, prose generation, and maintaining the narrative flow.

2. **EDITING Model (Fuchsia)**
   - **Icon**: <img src="https://cdn.jsdelivr.net/npm/lucide-static@1.0.0/icons/edit-2.svg" alt="Edit Pencil icon" width="20" height="20" style="vertical-align:middle;" /> Edit Pencil
   - **Color Hint**: <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:16px;height:16px;border-radius:3px;border:1px solid #f9a8d4;background:#fdf2f8;"></span><span style="color:#be185d;font-weight:600;">Fuchsia</span></span> (background #fdf2f8, text #be185d)
   - **Purpose**: Modifying, rewriting, and critiquing existing text.
   - **Capabilities**: This model is called when you highlight text in the editor and ask the AI to "Rewrite," "Condense," or "Change Tone." It focuses on precision, grammar, style adjustments, and following specific editing instructions without hallucinating new plot points.

3. **CHAT Model (Blue)**
   - **Icon**: <img src="https://cdn.jsdelivr.net/npm/lucide-static@1.0.0/icons/message-square.svg" alt="Message Square icon" width="20" height="20" style="vertical-align:middle;" /> Message Square
   - **Color Hint**: <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:16px;height:16px;border-radius:3px;border:1px solid #93c5fd;background:#dbeafe;"></span><span style="color:#1d4ed8;font-weight:600;">Blue</span></span> (background #dbeafe, text #1d4ed8)
   - **Purpose**: Conversational assistance, brainstorming, and project management.
   - **Capabilities**: This model powers the AI Chat Assistant in the right sidebar. It can answer questions about your story, brainstorm ideas, summarize chapters, and even take actions like creating new Sourcebook entries or updating your Story Metadata.

By separating these tasks, you can use a highly creative model for writing, a precise model for editing, and a fast, conversational model for chatting.

Next up: Explore [The Writing Interface](writing_interface.md).
