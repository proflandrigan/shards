// ═══════════════════════════════════════════════════════════════
// Agent data
// ═══════════════════════════════════════════════════════════════

var AGENTS = {
  'syn':                    { color: '#FFD700', label: 'Syn (Orchestrator)',           desc: 'Triage, delegation, and final review',                          type: 'orchestrator', category: 'route', keywords: [] },
  'data-analyst':           { color: '#4CAF50', label: 'Data Analyst',                desc: 'Quick adhoc queries and analyses',                              type: 'specialist',   category: 'analytics',  keywords: ['sql', 'query', 'adhoc', 'quick', 'analyze', 'explore', 'summarize', 'aggregate', 'metrics', 'kpi'] },
  'data-scientist':         { color: '#2196F3', label: 'Data Scientist',              desc: 'EDA, feature engineering, and predictive modeling',              type: 'specialist',   category: 'data',  keywords: ['eda', 'exploratory', 'hypothesis', 'statistical', 'correlation', 'predict', 'notebook', 'feature', 'study', 'regression'] },
  'data-engineer':          { color: '#FF9800', label: 'Data Engineer',               desc: 'Pipelines, dbt models, warehouse infrastructure',                type: 'specialist',   category: 'data',  keywords: ['pipeline', 'etl', 'ingestion', 'source', 'warehouse', 'airflow', 'batch', 'streaming', 'integration', 'orchestrate'] },
  'data-modeller':          { color: '#00BCD4', label: 'Data Modeller',               desc: 'Entity-relationship design, grain, and conformance',             type: 'specialist',   category: 'data',  keywords: ['schema', 'erd', 'entity', 'grain', 'dimension', 'fact', 'dimensional', 'conform', 'data model', 'design'] },
  'analytics-engineer':     { color: '#8BC34A', label: 'Analytics Engineer',          desc: 'dbt transformation layers, staging to mart',                     type: 'specialist',   category: 'data',  keywords: ['dbt', 'transform', 'staging', 'mart', 'intermediate', 'layer', 'model layer'] },
  'ml-engineer':            { color: '#F44336', label: 'ML Engineer',                 desc: 'Recommenders, ranking, classification, production ML',           type: 'specialist',   category: 'mlai', keywords: ['recommender', 'ranking', 'classification', 'production ml', 'train', 'inference', 'serve', 'feature store'] },
  'ai-engineer':            { color: '#9C27B0', label: 'AI Engineer',                 desc: 'LLM workflows, RAG, prompt engineering, agentic systems',        type: 'specialist',   category: 'mlai', keywords: ['llm', 'rag', 'prompt', 'agentic', 'gpt', 'embedding', 'retrieval', 'chatbot', 'openai', 'langchain', 'agent'] },
  'applied-ml-scientist':   { color: '#673AB7', label: 'Applied ML Scientist',       desc: 'Novel framework design, cutting-edge methodology',               type: 'specialist',   category: 'mlai', keywords: ['novel', 'research', 'loss function', 'architecture', 'methodology', 'cutting-edge', 'framework design', 'custom loss'] },
  'deep-learning-engineer': { color: '#03A9F4', label: 'Deep Learning Engineer',     desc: 'Neural architecture design, training protocols, custom models',   type: 'specialist',   category: 'mlai', keywords: ['neural', 'pytorch', 'tensorflow', 'fine-tune', 'lora', 'transformer', 'bert', 'training', 'backbone', 'deep learning'] },
  'mlops-engineer':         { color: '#FF5722', label: 'MLOps Engineer',              desc: 'Model deployment, serving, monitoring, retraining',               type: 'specialist',   category: 'mlai', keywords: ['deploy', 'deployment', 'serving', 'monitoring', 'drift', 'retrain', 'registry', 'kubernetes', 'docker', 'mlops', 'ci/cd'] },
  'bi-engineer':            { color: '#E91E63', label: 'BI Engineer',                 desc: 'Streamlit, Plotly Dash, dashboards, chart design',               type: 'specialist',   category: 'analytics', keywords: ['dashboard', 'chart', 'visualization', 'streamlit', 'plotly', 'dash', 'report', 'altair', 'graph', 'visual'] },
  'backend-engineer':       { color: '#9E9E9E', label: 'Backend Engineer',            desc: 'Python code review, FastAPI, Pydantic, performance',             type: 'review',       category: 'review', keywords: ['python', 'fastapi', 'pydantic', 'code review', 'api', 'refactor', 'clean code', 'backend', 'performance'] },
  'researcher':             { color: '#795548', label: 'Researcher',                  desc: 'Statistical methodology and assumption validation',              type: 'review',       category: 'review', keywords: ['statistics', 'assumption', 'distribution', 'outlier', 'sample size', 'power analysis', 'methodology review'] },
  'academic':               { color: '#607D8B', label: 'Academic',                    desc: 'Safety, ethics, and efficacy review',                            type: 'review',       category: 'review', keywords: ['safety', 'ethics', 'efficacy', 'behavior', 'cognitive', 'fairness', 'bias', 'harm', 'psychology'] },
};

function activateAgent(agentKey) {
  currentAgent = agentKey;
  var info = AGENTS[agentKey] || { color: '#3860c0' };
  document.documentElement.style.setProperty('--current-accent', info.color);
  if (agentKey) {
    document.documentElement.setAttribute('data-agent', agentKey);
  } else {
    document.documentElement.removeAttribute('data-agent');
  }
}
