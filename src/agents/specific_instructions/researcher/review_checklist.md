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
