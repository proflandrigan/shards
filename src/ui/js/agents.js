// ═══════════════════════════════════════════════════════════════
// Agent data
// ═══════════════════════════════════════════════════════════════

var AGENTS = {
  'jfl':                    { color: '#FFD700', label: 'JFL (Orchestrator)',           desc: 'Triage, delegation, and final review',                          type: 'orchestrator' },
  'data-analyst':           { color: '#4CAF50', label: 'Data Analyst',                desc: 'Quick adhoc queries and analyses',                              type: 'specialist' },
  'data-scientist':         { color: '#2196F3', label: 'Data Scientist',              desc: 'EDA, feature engineering, and predictive modeling',              type: 'specialist' },
  'ml-engineer':            { color: '#F44336', label: 'ML Engineer',                 desc: 'Recommenders, ranking, classification, production ML',           type: 'specialist' },
  'ai-engineer':            { color: '#9C27B0', label: 'AI Engineer',                 desc: 'LLM workflows, RAG, prompt engineering, agentic systems',        type: 'specialist' },
  'data-engineer':          { color: '#FF9800', label: 'Data Engineer',               desc: 'Pipelines, dbt models, warehouse infrastructure',                type: 'specialist' },
  'data-modeller':          { color: '#00BCD4', label: 'Data Modeller',               desc: 'Entity-relationship design, grain, and conformance',             type: 'specialist' },
  'analytics-engineer':     { color: '#8BC34A', label: 'Analytics Engineer',          desc: 'dbt transformation layers, staging to mart',                     type: 'specialist' },
  'bi-engineer':            { color: '#E91E63', label: 'BI Engineer',                 desc: 'Streamlit, Plotly Dash, dashboards, chart design',               type: 'specialist' },
  'applied-ml-scientist':   { color: '#673AB7', label: 'Applied ML Scientist',       desc: 'Novel framework design, cutting-edge methodology',               type: 'specialist' },
  'deep-learning-engineer': { color: '#03A9F4', label: 'Deep Learning Engineer',     desc: 'Neural architecture design, training protocols, custom models',   type: 'specialist' },
  'mlops-engineer':         { color: '#FF5722', label: 'MLOps Engineer',              desc: 'Model deployment, serving, monitoring, retraining',               type: 'specialist' },
  'backend-engineer':       { color: '#9E9E9E', label: 'Backend Engineer',            desc: 'Python code review, FastAPI, Pydantic, performance',             type: 'review' },
  'researcher':             { color: '#795548', label: 'Researcher',                  desc: 'Statistical methodology and assumption validation',              type: 'review' },
  'academic':               { color: '#607D8B', label: 'Academic',                    desc: 'Safety, ethics, and efficacy review',                            type: 'review' },
};

function activateAgent(agentKey) {
  currentAgent = agentKey;
}
