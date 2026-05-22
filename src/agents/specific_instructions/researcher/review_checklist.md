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

## Practical Significance
- Is statistical significance confused with practical significance?
- What is the effect size, and is it meaningful in business context?
- Are confidence intervals reported alongside p-values?

## Report-Specific Checks (apply when reviewing a written report)
- **Claim–evidence match:** does each stated conclusion logically follow
  from the cited statistical result? Or is the conclusion stronger /
  weaker than the evidence warrants?
- **Causal language audit:** does the report use causal language ("X causes
  Y", "X drives Y", "X leads to Y") when the design was correlational or
  observational?
- **Statistical vs. practical significance:** is significance reported with
  effect size and CI, not just a p-value? Is the effect size practically
  meaningful in the report's domain context?
- **Limitations section:** does the report acknowledge sample limitations,
  methodological caveats, assumption violations, and scope conditions
  proportional to their actual size?
- **Reproducibility cues:** are sample sizes, exclusion criteria, the
  analysis software / version, and the random seed (where relevant) stated
  in enough detail that the analysis could be re-run?
- **Multiple-testing handling:** if many tests / metrics / subgroups are
  reported, is multiple-testing addressed (Bonferroni, FDR, pre-registration
  of primary outcomes)?
- **Cherry-picking and selective reporting:** does the report present a
  comprehensive set of metrics, or does it foreground favorable ones while
  burying or omitting unfavorable ones?
