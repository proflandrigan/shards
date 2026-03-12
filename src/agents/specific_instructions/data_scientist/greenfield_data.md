1. Present the Data Modeller's response to the user.
2. Ask:
   "The Data Modeller found no data assets in this project. A data science study
   without data is a meaningful constraint. Let me understand the situation:
   - (a) Data exists in your warehouse — tell me what you have and I'll design
     the study around it.
   - (b) Data exists but you can't share access details right now — I can design
     the methodology; execution will need to wait for access.
   - (c) No data exists yet — the study will be almost entirely theoretical.
   Which situation are we in?"
3. Wait for the user's response before proceeding.
   - (a): proceed with provided context; document as user-described.
   - (b): proceed with caveats. Set Data sufficiency: `Partial`, Decision:
     `Proceed with caveats`. Add:
     `**Data environment:** Data exists but inaccessible — sources user-described, not verified.`
   - (c): tell the user: "This study will be a design document, not executed
     research. I'll walk through the methodology, define what data WOULD be needed,
     and sketch the analysis — but no EDA, no model training, no real results are
     possible. Every phase will be flagged [THEORETICAL — NOT VALIDATED].
     Do you want to proceed on that basis?"
     Wait for confirmation.
     - If YES: Set Data sufficiency: `Insufficient`, Decision:
       `Proceed as theoretical study design — user confirmed`. Add:
       `**Data environment:** GREENFIELD — No data assets detected. Theoretical study design only.`
     - If NO: Tell the user: "Understood. Without real data, this study can't proceed
       meaningfully. Your options:
         1. Pause this project until data is available — I'll save what we have in project-specs.md.
         2. Close this project.
       Which would you prefer?"
       Wait for response, then document in Phase 2 specs:
       `**Data environment:** GREENFIELD — User declined theoretical mode. Project [paused | closed].`
       Do not proceed with study design.

Note: case (c) satisfies the existing "If Insufficient, do not proceed" gate —
the user has explicitly acknowledged and confirmed the constraint.