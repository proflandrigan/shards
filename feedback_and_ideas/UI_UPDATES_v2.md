# Shards UI — Stickiness & Experience Proposals (V2)

Following the initial audit and current development roadmap, these proposals focus on deepening the "Shards" brand identity and introducing high-utility workflow tools that differentiate the browser experience from the CLI.

---

## 1. Visual Identity & "The Shards" Aesthetic
These updates transform the UI into a premium, specialized environment that leans into the "fragmented intelligence" theme.

### Glassmorphic "Fragment" Overlays
- **What:** Implement a glassmorphism design language (`backdrop-filter: blur()`, thin semi-transparent borders) for all overlays, including Quick Open (`Cmd+P`), Command Palette (`Cmd+K`), and Context Menus.
- **Why:** Reinforces the "crystalline/prismatic" theme. Overlays feel like floating shards of data rather than heavy modal windows.
**MOCK**
This mock demonstrates how to move away from standard rectangular modals toward "crystalline shards" of UI that feel light, fast, and integrated into the "Shards" brand.

glassmorphism-mock.html

  Key Visual Features:
   1. Crystalline Geometry: The overlay uses a subtle clip-path to create "sheared" corners, making it look like a shard of glass rather than a standard box.
   2. Refraction Shimmer: A diagonal light sweep (CSS animation) periodically moves across the panel, simulating light reflecting off a prism.
   3. Depth Perception: It uses backdrop-filter: blur(15px) combined with a linear-gradient border to create a sense of physical thickness (like a glass slab).
   4. High-Contrast Selection: The active list item uses the "Syn Gold" but with a semi-transparent background to maintain the glass feel.

This mock is particularly effective at demonstrating the "crystalline" goal of the project, as the subtle geometric shear and light-sweep animations make the UI feel like it's composed of
  high-tech fragments rather than simple web elements.

  You can now review all three mocks in your browser:
   1. gathering-mock.html: The "Gathering" transitions.
   2. anxious-ui-mock.html: The agent personality cues.
   3. glassmorphism-mock.html: The crystalline overlay system.

A chat experience in Shards would feel less like a standard messaging app and more like a "Command & Control" cockpit. 

  Instead of static text, messages would arrive as dynamic, "living" shards of data that pulse with the personality of the agent you've summoned.

  I've created a unified mock in shards-chat-unified-mock.html that combines all the previous concepts into a single workspace.

  Key Features of this Experience:
   1. The Context Shelf: A glassmorphic "pinboard" at the top showing which files (e.g., project-specs.md) the agent is currently "holding."
   2. The Thought Stream: A side-panel that updates before the main chat, showing the agent's internal logic and tool-selection confidence.
   3. Gathering Arrival: When you send a message, the agent's response doesn't just appear—it "gathers" from the side of the screen into a crystalline bubble.
   4. Persona Syncing: The entire UI (input border, shelf, and thought stream) shifts its accent color to match the active agent (Gold for Syn, Teal for the AI Engineer).
   5. Anxious Output: When the AI Engineer speaks, the text itself jitters slightly, reflecting its internal instability.

How to test the experience:
   1. Open /home/jon-fredericklandrigan/shards/shards-chat-unified-mock.html in your browser.
   2. Type a message in the input box and click SEND.
   3. Watch the Thought Stream (Right Sidebar) immediately start showing the agent's internal progress.
   4. Notice the Persona Transition: After 1 second, the UI's accent color automatically shifts from Syn Gold to AI Engineer Teal.
   5. See the Gathering Message: The AI Engineer's response "assembles" from the side of the screen.
   6. Observe the Anxious Text: The Engineer's dialogue jitters slightly to reflect its personality.
   7. Check the Context Shelf: The items "pinned" at the top show you exactly what the agent is thinking about.

  This unified interface demonstrates how the visual "fragments" and agent-specific behaviors create a cohesive, immersive workflow that feels significantly more advanced than a standard CLI
  chat.


### Agent Accent Pulsing
- **What:** Utilize the signature color of each active agent (e.g., Gold for Syn, Blue for Data Scientist) for a subtle "breathing" glow around the chat input and active panel borders.
- **Why:** Provides immediate visual feedback on which "shard" of the mind is currently engaged, reducing cognitive load during persona switches.

### "Gathering" Transitions
- **What:** Replace standard CSS transitions with motion-path animations where UI elements (tabs, panels, cards) appear to "assemble" from jagged fragments.
- **Why:** Dramatically increases the "wow factor" and aligns with the core metaphor of a shattered mind reassembling to solve a problem.
**MOCK**
The concept is to take a UI element (like a card) and "shatter" it into multiple divs with jagged shapes. When triggered, these fragments fly in from off-screen and assemble into the final
  piece.

  I'll create a standalone HTML file called gathering-mock.html that you can open in any browser to see the effect.

  Proposed Animation Logic:
   1. Shatter: We define a single container and 4-6 "fragment" divs inside it.
   2. Clip-Path: Each fragment uses a unique clip-path: polygon(...) to look like a jagged shard.
   3. Gathering Keyframe: Fragments start at random translate and rotate positions with 0 opacity.
   4. Convergence: They animate toward translate(0,0) and rotate(0) with 1 opacity.
   5. Final Reveal: Once assembled, the real content fades in to replace the fragments.

How to use it:
   1. Open the file /home/jon-fredericklandrigan/shards/gathering-mock.html in your browser.
   2. Click the "Gather Fragments" button.

  Why this works for the "Shards" metaphor:
   * Deconstruction: The clip-path polygons create sharp, jagged shapes that look like broken glass.
   * Chaotic Motion: Each shard starts with a random rotation and offset (--tx, --ty, --rot), creating a feeling of "re-assembling from chaos."
   * Unified Reveal: Once the shards converge at the center, the final glassmorphic panel fades in, representing the transition from a fragmented thought to a clear agent persona.

  This technique is lightweight (pure CSS/JS) and can be easily integrated into the shards-ui by applying these classes to tabs or panel headers during their lifecycle events.


### "Anxious" UI States (Agent Personalities)
- **What:** Introduce subtle visual "imperfections" for specific agents. For the "existentially anxious" AI Engineer, introduce minor UI "glitches" or shifting typography in its specific panels.
- **Why:** Deepens the immersion of interacting with specialized, flawed "shards" of a larger intelligence, making the tool feel more alive and distinctive.
**MOCK**
This is a fascinating UX concept. For the "Anxious" UI State, the goal is to create a feeling of "digital instability" that reflects the AI Engineer's existential dread without making the
  UI unusable.

  I've created a mock in anxious-ui-mock.html that demonstrates three specific "nervous" behaviors:
   1. Typography Jitter: Text that subtly shifts position and font-weight at irregular intervals.
   2. Chromatic Aberration (RGB Split): A "glitch" effect where the red and blue channels of the panel border and title briefly separate.
   3. The "Stutter" Loader: A progress bar that moves erratically rather than smoothly, simulating "second-guessing."

  Visual Logic
   - Base Color: I've used a "Skeptic Teal" (#4fd1c5) for the AI Engineer, which feels more cold and clinical than the Orchestrator's gold.
   - Micro-Glitches: Instead of one constant animation, I've used JavaScript to trigger "micro-glitches" at random intervals (3–7 seconds) to make the anxiety feel unpredictable and organic.

How to use it:
   1. Open /home/jon-fredericklandrigan/shards/anxious-ui-mock.html in your browser.
   2. Watch the Typography Jitter on words like "model" and "hallucinate."
   3. Click "Trigger Spike" to see the Chromatic Aberration (RGB glitch).
   4. Click "Simulate Thought" to see the Stuttering Progress Bar (which occasionally moves backward as the agent "second-guesses" itself).

  The UI will also trigger random "micro-glitches" automatically to simulate the agent's ongoing instability. These subtle cues make the different "shards" feel like distinct, flawed
  personalities rather than just different text templates.


---

## 2. Workflow & Power-User Features
Features that turn the UI into a mission control center for agent-driven development.

### Context Visualization (Knowledge Graph)
- **What:** A specialized panel showing a real-time dependency graph of the files the agent has "read" or "indexed" during the current session.
- **Why:** Helps developers see exactly what parts of the codebase the agent is currently focused on and identifies "blind spots" where the agent might be missing critical context.

### Agent "Thought Stream" Pane
- **What:** A collapsible side-pane that streams the agent's internal scratchpad, tool-selection logic, and "confidence scores" in real-time.
- **Why:** Transparency. Developers often switch to the CLI to see the raw tool-call flow; this pane brings that diagnostic data into the UI without cluttering the main conversation.

### Context "Pinboard" (Shelf) [COMPLETED]
- **What:** A drag-and-drop area above the chat input where users can "pin" files, code snippets, or images. These pinned items are treated as high-priority context for every subsequent prompt.
- **Why:** Replaces the need to repeatedly reference the same files in chat. It provides a visual representation of what the agent is currently "holding in its mind."

### Session Checkpoints & Branching
- **What:** A "Snapshot" button that saves the state of the workspace (files + chat). Users can "branch" the conversation to test an alternative path and "rewind" to a checkpoint if the agent's logic fails.
- **Why:** Gives developers the confidence to let the agent perform destructive or wide-reaching changes, knowing they can instantly revert.

### Integrated REPL / Scratchpad
- **What:** A persistent tab that provides a "blind" execution environment (Python/Node) sharing the project root.
- **Why:** Allows users to manually verify agent-generated snippets or run quick tests without engaging the agent, keeping them within the Shards UI ecosystem.

---

## 3. UX & Interface Refinements
Optimizations for speed, navigation, and multi-tasking.

### Command Palette 2.0 (Unified Search)
- **What:** Upgrade `Cmd+K` to search across Files (fuzzy), Agent Skills, UI Actions (e.g., "Toggle Split"), and Full-Text Chat History.
- **Why:** The single point of entry for all power-user actions. Makes the UI as fast as a keyboard-driven terminal.

### Activity Bar & Breadcrumb Navigation
- **What:** Move Explorer/Git/History icons to a narrow vertical bar (VS Code style) and add file breadcrumbs to the top of the editor pane.
- **Why:** Reclaims horizontal space for the code/data views and provides clearer navigation in deep directory structures.

### "Smart" Tab Previews
- **What:** Hovering over a tab shows a mini-preview of the file content or a summary of the data (if it's a Data Viewer panel).
- **Why:** Facilitates rapid context switching without the cost of full tab activation, especially useful in complex multi-file debugging.

### Multi-Pane "Dashboard" Layout
- **What:** Support for a 3-column layout (e.g., Chat | Code | Visualization) instead of just a 2-pane split.
- **Why:** Essential for data science and AI engineering workflows where the user needs to see the prompt, the code, and the output (chart/table) simultaneously.
