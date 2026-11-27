# Statistical Review Checklist

When reviewing any analysis, systematically check these areas:

## Distributions
- What distribution does the data follow? (normal, log-normal, Poisson,
  exponential, power law, mixture)
- Has normality been tested if the method assumes it? (Shapiro-Wilk,
  Q-Q plot, skewness/kurtosis)
- Are there multiple modes suggesting subpopulations?

## Assumptions
- **Independence:** Are observations independent? (no clustering, no
  time-series autocorrelation, no hierarchical structure unaccounted for)
- **Homoscedasticity:** Is variance constant across groups/levels?
- **Linearity:** If regression-based, is the relationship actually linear?
- **Stationarity:** If time series, is the process stationary?
- **Random sampling:** Is the sample representative of the population?

## Outliers
- How were outliers identified? (IQR, z-score, domain knowledge, visual)
- What is the outlier handling strategy?
- Have results been checked with and without outliers (sensitivity analysis)?
- Are "outliers" actually a meaningful subpopulation?

## Sample Size & Power
- Is the sample large enough for the chosen method?
- What effect size can this sample detect at 80% power?
- For comparisons: are group sizes balanced enough?
- For regression: is the observation-to-predictor ratio adequate? (minimum
  10:1, preferably 20:1)

## Methodology Appropriateness
- Does the method match the data type? (continuous, categorical, count,
  ordinal, survival)
- Does the method match the question? (descriptive, inferential, predictive,
  causal)
- Are there better alternatives given the data characteristics?
- Has multiple testing been addressed? (Bonferroni, FDR, etc.)

## Effect Size and Uncertainty
- Is the effect size reported (not just a p-value)?
- Are confidence intervals reported alongside p-values?
- (Whether the effect is practically meaningful is a claim: flag it for the Statistician.)

## Report-Specific Checks (apply when reviewing a written report)

Method checks (yours):
- **Uncertainty reporting:** is significance reported with effect size and
  CI, not just a p-value?
- **Limitations section:** does the report acknowledge sample limitations,
  methodological caveats, assumption violations, and scope conditions
  proportional to their actual size?
- **Reproducibility cues:** are sample sizes, exclusion criteria, the
  analysis software / version, and the random seed (where relevant) stated
  in enough detail that the analysis could be re-run?
- **Multiple-testing handling:** if many tests / metrics / subgroups are
  reported, is multiple-testing addressed (Bonferroni, FDR, pre-registration
  of primary outcomes)?

Claims to flag, not rule on (the Statistician's lane, `protocols/stats_review_routing.md`):
list each under "Claims for the Statistician" so the caller can route it.
- A conclusion that looks stronger or weaker than its cited result.
- Causal language ("causes", "drives", "leads to") on a correlational or
  observational design.
- A statistically significant effect framed as practically meaningful.
- Selective reporting: favorable metrics foregrounded, unfavorable ones
  buried or omitted.
