# <img src="icon.png" alt="Doc Agent Icon" width="33" style="float:left;padding:0 10px 0px 0">  Logseq Doc Agent




  <center>
    <a href="https://raw.githubusercontent.com/secondbrain-tools/logseq-doc-agent/master/docs/screenshots/doc-agent.png">
      <img src="https://raw.githubusercontent.com/secondbrain-tools/logseq-doc-agent/master/docs/screenshots/doc-agent.png" alt="Logeseq with Doc Agent editing Content" width="500"/>
    </a>
  </center>

- The Doc Agent is inspired by modern IDE coding-agent integrations. It is a research prototype, but it is already useful in practice.
- The intent is to explore non-intrusive ways to integrate an agent into knowledge management and content creation systems like Logseq. Since Logseq is a thinking space, the Doc Agent shall be developed to support thought processes, not take them over.

## Available Features
  
  ### Agent capabilities
   Current features are limited to Editing and Evaluation / Feedback:  
   
   #### Edit Page Content
   - change, add, delete blocks
   
   #### Perform Content Evaluations using Custom Evaluation Schemes (Rubrics)
   - You can define categories, criteria and scoring rules. Or let the Doc Agent create those rules together with you.
   - The evaluation is stored within the block.
  
  ### Usability Features
   
   #### The agent's changes are small merge requests
   - The original content is stored in a merge property at the block. Changed blocks are highlighted. (see screenshot on top)
   - You can accept, revert or merge changes. The merge dialog uses an inline diff right in the text - ideally word-by-word and, if needed, line-by-line.
  
   #### Evaluations are integrated non-intrusively in the Logseq UI and meant to support your thinking
   - Browse Issues by category and criterion within a popover or in the sidebar. Choose between multiple suggestions and see a counterargument to let you reason about the feedback.
     Remark: This is the current state of development. It seems a bit cumbersome to navigate - at least in the popover.  

     <center>
       <a href="https://raw.githubusercontent.com/secondbrain-tools/logseq-doc-agent/master/docs/screenshots/evaluation-sidebar.png">
        <img src="https://raw.githubusercontent.com/secondbrain-tools/logseq-doc-agent/master/docs/screenshots/evaluation-sidebar.png" alt="Evaluation Sidebar" width="500"/>
      </a>
     
      <a href="https://raw.githubusercontent.com/secondbrain-tools/logseq-doc-agent/master/docs/screenshots/evaluation-popover.png">
        <img src="https://raw.githubusercontent.com/secondbrain-tools/logseq-doc-agent/master/docs/screenshots/evaluation-popover.png" alt="Evaluation Popover" width="500"/>
      </a>
     </center>

   - Activate the "Pre-Commitment Prompt" that requires you to enter an improvement suggestion for an issue, before seeing the AI generated ones.
   - Discuss issues with the LLM directly within the evaluation UI.
   
   #### UI
   - Maximize chat window
   - Maximizes chat input field
   - Pop out chat into a new window   

   ### Adaptability
    - Add custom agents definitions
    - Add custom prompts
    - Under the page `logseg-doc-agent` in your project you find the built in agents and prompts.

## Supported Logseq Version
- It is currently only available for the File-Based Version of Logseq, since I am trying to use the Doc Agent during my daily work.
- It is planned to support the DB version, when a migration of my data is feasible.

## Supported LLM Endpoints
- Anthropic
- Google
- Mistral
- OpenAI (currently, the only one tested)

- OpenAI Compatible Providers: Define multiple custom provides. For example for [OpenRouter](https://openrouter.ai/), [LM Studio](https://lmstudio.ai/) or [Ollama](https://ollama.ai/) . 
  - Remark: currently an API kay is always required, even if the provider is not using it. (just enter any random string)

## Installation

1. Install it via the Logseq Marketplace. Add at least one LLM provider to your setup.

2. Select a default AI Model and a Mini AI model. The latter is used for small tasks like name chatlogs.

3. **Important:** edit your `config.edn`:

   We need to hide clunky merge and evaluation blocks from the UI.
   - via Settings > General > Custom configuration > [Edit config.edn]
   - Add the following two properties your `block-hidden-properties`
   
     - `logseq-doc-agent.merge`
     - `logseq-doc-agent.evaluation`
   
     e.g.:
     ```clojure
     :block-hidden-properties #{:logseq-doc-agent. merge :logseq-doc-agent.evaluation}
     ```

## Customize Agents and Prompts

The page `logseq-doc-agent`in graph acts as entrypoint for logseq.
 - in the subpage Agent, you find the included agent definition. Add you own agents on any other page in your graph. To  change the built in agents, use their name to override them.
 - in the subpage Prompt, you find the included prompt definitions. Similar to agents, you can add your own prompts on any other page in your graph. To change the built in prompts, use their name to override them.
   - Except for the base prompt, all prompts are written from the user's perspective, normally using I. They will be prepended before your message.
   - Prompts can be added using `/`in the Chat Input.
 - Built in prompts or agents under `logseq-doc-agent` can be overwritten with future updates. 

## Current Insights
- The merge mode improves working with important documents by making changes easy to track and, if necessary, revert. Ideally, the diff and merge workflow would be integrated directly into the document; however, this functionality might also be better implemented in Logseq itself.
- The evaluation tool has the potential to become an important feedback mechanism. A few minor inconsistencies still need to be addressed. At the moment, it is not clear whether suggestions are meant to be applied directly or are intended as guidance for the user. Readability is not yet optimal.
   logseq-doc-agent.merge:: {"type":"update","base":"Das evaluation tool hat potenzial ein wichtiges feedback-werkzeug zu werden. Kleine Ungereimtheiten müssen noch überarbeitet werden. Aktuell ist nicht sichtbar, ob Vorschläge direkt anwendbar, oder an den Anwender gerichtet sind. Die Lesbarkeit ist noch nicht optimal. \nEventuell wäre ein \"Highlight all findings\"-mode im Dokument nützlich."}
      
   A “highlight all findings” mode within the document could also be useful.