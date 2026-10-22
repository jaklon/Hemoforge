export const methodReferences = [
  {
    id: "sigman",
    title: "Karl Sigman — Geometric Brownian Motion",
    detail:
      "Columbia University lecture notes, §1. Mathematical background for a lognormal process; not evidence of cell-culture validity.",
    url: "https://www.columbia.edu/~ks20/FE-Notes/4700-07-Notes-GBM.pdf",
  },
  {
    id: "numpy",
    title: "NumPy — quantile",
    detail:
      "Reference for the default linear interpolation used to summarize simulated paths.",
    url: "https://numpy.org/doc/stable/reference/generated/numpy.quantile.html",
  },
  {
    id: "gpml",
    title:
      "Rasmussen & Williams (2006) — Gaussian Processes for Machine Learning",
    detail:
      "MIT Press, chapter 2, equations 2.25–2.26. Posterior mean and latent variance in Gaussian process regression.",
    url: "https://gaussianprocess.org/gpml/chapters/RW2.pdf",
  },
  {
    id: "jones",
    title:
      "Jones, Schonlau & Welch (1998) — Efficient Global Optimization of Expensive Black-Box Functions",
    detail:
      "Journal of Global Optimization 13, 455–492. Expected improvement as an acquisition criterion. DOI: 10.1023/A:1008306431147.",
    url: "https://link.springer.com/article/10.1023/A:1008306431147",
  },
  {
    id: "dbsnp",
    title: "NCBI — dbSNP RefSNP records",
    detail:
      "Variant identity and assembly context. An rs ID is a database identifier; allele orientation and genome assembly must be checked separately.",
    url: "https://www.ncbi.nlm.nih.gov/snp/",
  },
  {
    id: "bayley",
    title:
      "Bayley et al. (2018) — The productivity limit of manufacturing blood cell therapy in scalable stirred bioreactors",
    detail:
      "J Tissue Eng Regen Med 12(1), e368-e378. Erythroblast growth rates from exponential fits (0.029/h static, 0.051/h stirred; 24.25 h and 13.93 h doubling), population doublings as 3.33 log10 of the count ratio, and lactate/ammonia inhibition above roughly 15 mM and 4 mM. DOI: 10.1002/term.2337.",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5811890/",
  },
  {
    id: "phillips",
    title:
      "Phillips et al. (2025) — Characterizing a novel adult erythroid cell line for red blood cell manufacture",
    detail:
      "BEL-A counts decline beyond 70 h of static batch culture; viability is more sensitive to ammonia than lactate, and 2640 mg/L lactate with 129 mg/L ammonia mediated cell death. DOI: 10.1002/btm2.70026; confirm the journal record, which is listed inconsistently.",
    url: "https://research-information.bris.ac.uk/en/publications/characterizing-a-novel-adult-erythroid-cell-line-for-red-blood-ce/",
  },
  {
    id: "timmins",
    title:
      "Timmins et al. (2011) — Ultra-high-yield manufacture of red blood cells from hematopoietic stem cells",
    detail:
      "Tissue Eng Part C Methods 17(11), 1131-1137. Fold-expansion context for cultured red cells: over 500 units per cord blood donation with above 90 percent enucleation, including agitated bioreactors.",
    url: "https://journals.sagepub.com/doi/abs/10.1089/ten.tec.2011.0207",
  },
  {
    id: "trakarnsanga",
    title:
      "Trakarnsanga et al. (2017) — An immortalized adult human erythroid line facilitates sustainable and scalable generation of functional red cells",
    detail:
      "Nature Communications 8, 14750. Origin of the BEL-A line named in the bundled demo fixtures. Source provenance only; it does not validate any bundled measurement.",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5355882",
  },
  {
    id: "isbt",
    title:
      "ISBT Working Party on Red Cell Immunogenetics and Blood Group Terminology",
    detail:
      "Registry of blood group systems, antigens and alleles: KEL is system 006 and JK (SLC14A1, 18q12.3) is system 009. Allele naming and antigen assignment follow this registry, not an rs identifier alone.",
    url: "https://www.isbtweb.org/isbt-working-parties/rcibgt/members-assignments-and-activities.html",
  },
] as const

export const methods = [
  {
    id: "growth",
    title: "Growth simulation",
    module: "ErythroPilot",
    route: "pilot",
    engine: "Python · growth-lognormal-v2",
    intro:
      "A stationary lognormal process fitted to positive cell counts available at the replay cutoff. A run uses only the selected batch and fitting window.",
    notation:
      "Nᵢ is the count in million cells at time tᵢ (hours). There are n observations and m = n − 1 time intervals. g is log-growth per hour; σ is volatility per square-root hour.",
    equations: [
      {
        id: "growth-fit",
        name: "Fit log-growth and variability",
        latex: String.raw`\begin{aligned}d_i&=t_i-t_{i-1},\quad r_i=\ln\!\left(\frac{N_i}{N_{i-1}}\right)\\ \widehat g&=\frac{\sum_{i=1}^{m}r_i}{\sum_{i=1}^{m}d_i},\qquad \widehat\sigma^2=\frac{1}{m-1}\sum_{i=1}^{m}\frac{(r_i-\widehat g d_i)^2}{d_i}\end{aligned}`,
        explanation:
          "Intervals retain their actual duration, including fractional hours. The residual variance uses m − 1 degrees of freedom. At least three positive measurements with increasing times are required.",
      },
      {
        id: "growth-step",
        name: "Advance each simulated path",
        latex: String.raw`N(t+\Delta t)=N(t)\exp\!\left(g\,\Delta t+\sigma\sqrt{\Delta t}\,Z\right),\quad Z\sim\mathcal N(0,1)`,
        explanation:
          "Independent normal draws advance each path. Python first advances from the last observation to the replay cutoff if there is a gap, then returns hourly steps. The chosen seed makes the same request reproducible within the same model environment.",
      },
      {
        id: "growth-drift",
        name: "Interpret the drift parameter",
        latex: String.raw`\frac{dN_t}{N_t}=\left(g+\frac{\sigma^2}{2}\right)dt+\sigma\,dW_t`,
        explanation:
          "The app's rate control is the drift of log-count, g. It is not the arithmetic drift of N. The transition above already uses log drift, so subtracting another σ²/2 would change the implemented model.",
      },
    ],
    limits:
      "User-entered rate and volatility replace the fitted values. The process assumes constant growth and variability, and omits feeding, contamination, carrying capacity, interventions, and maturation. It is an exploratory mathematical scenario with no demonstrated biological forecasting accuracy.",
    refs: ["bayley", "sigman"],
  },
  {
    id: "intervals",
    title: "Simulated ranges & chart axes",
    module: "ErythroPilot / Guard",
    route: "pilot",
    engine: "Python quantiles · browser chart coordinates",
    intro:
      "The shaded band summarizes the distribution across all returned paths at each time. The chart draws up to 24 individual paths for readability.",
    notation:
      "M is the requested number of paths. At one time, v₀ ≤ ⋯ ≤ vM₋₁ are their sorted values. p is the desired quantile probability.",
    equations: [
      {
        id: "quantiles",
        name: "Linear empirical quantiles",
        latex: String.raw`\begin{aligned}h&=(M-1)p,\quad j=\lfloor h\rfloor,\quad w=h-j\\ Q_p&=(1-w)v_j+w\,v_{\min(j+1,M-1)}\\ \text{median}&=Q_{0.5},\quad I_{95}=[Q_{0.025},Q_{0.975}],\quad I_{80}=[Q_{0.1},Q_{0.9}]\end{aligned}`,
        explanation:
          "This matches numpy.quantile with its default linear method. Ranges are pointwise Monte Carlo summaries, conditional on the selected parameters; they do not include uncertainty in the fitted parameters.",
      },
      {
        id: "log-axis",
        name: "Logarithmic display",
        latex: String.raw`y_{\mathrm{display}}=\log_{10}N,\quad N>0`,
        explanation:
          "Equal distances represent equal ratios. Tick labels and inspector values remain in the original units. Changing the axis, panning, and zooming change only the view; Python predictions and source measurements stay intact. Time uses a linear axis, including 0h.",
      },
    ],
    limits:
      "A 95% simulated range is not a calibrated 95% biological prediction interval or a simultaneous band across time. Zero, negative, and missing counts cannot be plotted on a logarithmic count axis.",
    refs: ["numpy", "bayley"],
  },
  {
    id: "gp",
    title: "Gaussian process experiment model",
    module: "CulturePlan",
    route: "plan",
    engine: "Python · experiment-rbf-gp-v2",
    intro:
      "The model relates lactate and ammonia settings to the observed response for each condition. Measurement noise is estimated from replicate runs; the length scale is supplied by the researcher rather than optimized automatically.",
    notation:
      "x contains lactate and ammonia in mg/L. y is the vector of condition means. b and s are the training means' average and population standard deviation (s = 1 when constant). ℓ is length scale. nᵢ and sᵢ are the run count and replicate SD of condition i; σ̂ is the pooled replicate SD.",
    equations: [
      {
        id: "gp-kernel",
        name: "Normalize factors and build the RBF kernel",
        latex: String.raw`\begin{aligned}u_{ij}&=\frac{x_{ij}}{\max(1,\max_k x_{kj})},\quad z=\frac{y-b}{s}\\ k(u,v)&=\exp\!\left(-\frac{\lVert u-v\rVert^2}{2\ell^2}\right)\ \widehat\sigma^2&=\frac{\sum_i(n_i-1)s_i^2}{\sum_i(n_i-1)},\quad C=K+\operatorname{diag}\!\left(\frac{\widehat\sigma^2}{s^2n_i}\right)\end{aligned}`,
        explanation:
          "Factor normalization uses the tested settings. Each training set supplies its own response normalization. The model fits condition means, so each mean's noise variance is the pooled replicate variance divided by its run count. Without any replicates, a normalized noise SD of 0.05 is assumed and flagged; a researcher override replaces the pooled estimate.",
      },
      {
        id: "gp-posterior",
        name: "Predict response and latent uncertainty",
        latex: String.raw`\begin{aligned}\mu_*&=b+s\,k_*^{\mathsf T}C^{-1}z\\ s_*&=s\sqrt{\max\!\left(0,1-k_*^{\mathsf T}C^{-1}k_*\right)}\end{aligned}`,
        explanation:
          "k* holds kernel values between the candidate and training conditions. Python solves the linear systems rather than explicitly forming the inverse. The displayed SD is latent-function uncertainty: additional measurement-noise variance is not added.",
      },
    ],
    limits:
      "Candidates are a 5 × 5 grid spanning the tested lactate and ammonia range, plus the tested conditions; the model does not extrapolate beyond the tested range. Pooling assumes the same noise in every condition. The GP assumes a smooth response surface and does not establish causal effects or a validated production recipe.",
    refs: ["gpml"],
  },
  {
    id: "improvement",
    title: "Expected improvement ranking",
    module: "CulturePlan",
    route: "plan",
    engine: "Python · experiment-rbf-gp-v2",
    intro:
      "Expected improvement balances predicted response against model uncertainty when ranking conditions for another measurement.",
    notation:
      "d = +1 for maximization and −1 for minimization. ybest is the best observed condition mean for that goal. ξ is the exploration margin in response units. Φ and φ are the standard normal CDF and density.",
    equations: [
      {
        id: "expected-improvement",
        name: "Acquisition score",
        latex: String.raw`\begin{aligned}a&=d(\mu_*-y_{\mathrm{best}})-\xi,\quad z=\frac{a}{s_*}\\ \operatorname{EI}&=\begin{cases}a\,\Phi(z)+s_*\phi(z),&s_*>0\\ \max(a,0),&s_*=0\end{cases}\end{aligned}`,
        explanation:
          "Conditions are sorted by descending EI. A numerical floor of zero removes tiny negative roundoff. Changing the goal or exploration margin requires a new Python fit.",
      },
    ],
    limits:
      "EI is a model-dependent acquisition score in response units, not a probability of success. This app evaluates it on a fixed grid inside the tested range; it does not run continuous global optimization.",
    refs: ["jones"],
  },
  {
    id: "validation",
    title: "Replicate summaries & held-out checks",
    module: "CulturePlan",
    route: "plan",
    engine: "Python validation · browser descriptive summaries",
    intro:
      "Replicate measurements are summarized within each condition. Model evaluation withholds one complete condition at a time, including all its replicates.",
    notation:
      "R is the number of replicates in a condition, with responses qᵣ. C is the number of conditions. ŷ₋ⱼ is the prediction after excluding condition j.",
    equations: [
      {
        id: "replicate-summary",
        name: "Observed mean and sample standard deviation",
        latex: String.raw`\bar q=\frac{1}{R}\sum_{r=1}^{R}q_r,\qquad s_q=\sqrt{\frac{\sum_{r=1}^{R}(q_r-\bar q)^2}{R-1}}`,
        explanation:
          "SD is unavailable for a single replicate. These descriptive summaries are currently calculated for display in the browser and independently aggregated by Python for fitting.",
      },
      {
        id: "held-out-mae",
        name: "Leave-one-condition-out mean absolute error",
        latex: String.raw`\begin{aligned}\operatorname{MAE}_{\mathrm{GP}}&=\frac{1}{C}\sum_{j=1}^{C}|y_j-\widehat y_{-j}|\\ \operatorname{MAE}_{\mathrm{baseline}}&=\frac{1}{C}\sum_{j=1}^{C}\left|y_j-\frac{1}{C-1}\sum_{k\ne j}y_k\right|\end{aligned}`,
        explanation:
          "Lower error is better. The baseline predicts the average of the other condition means. Response normalization is recomputed within each training fold. These are direct definitions used by this app, not an external performance claim.",
      },
    ],
    limits:
      "At least three distinct conditions are needed. A small held-out comparison does not establish external generalization, and selecting model settings after inspecting these errors can make them optimistic.",
    refs: ["gpml", "bayley"],
  },
  {
    id: "target",
    title: "Production target planning",
    module: "CulturePlan",
    route: "plan",
    engine: "Browser · deterministic arithmetic",
    intro:
      "A requested number of adult transfusion units is converted into the cell count, fold expansion, population doublings and culture time implied by exponential growth, then split into stages that respect the reported static-culture window and metabolite inhibition onsets.",
    notation:
      "U is the requested number of adult units and c = 2 × 10¹² red cells per unit. N₀ is the latest positive count in the selected batch. g is log-growth per hour, either fitted from the batch or taken from a published rate. W is the static-culture stage window in hours.",
    equations: [
      {
        id: "target-expansion",
        name: "Cells needed, fold expansion and population doublings",
        latex: String.raw`N_{\mathrm{target}}=Uc,\qquad F=\frac{N_{\mathrm{target}}}{N_0},\qquad \mathrm{PD}=\log_2 F=3.33\log_{10}F`,
        explanation:
          "Population doublings are the base-2 logarithm of the count ratio; the 3.33 log₁₀ form is the same quantity as written by Bayley et al. The starting count is read from the batch at the latest positive measurement, not from a nominal seeding density.",
      },
      {
        id: "target-time",
        name: "Doubling time, culture time and stage count",
        latex: String.raw`t_d=\frac{\ln 2}{g},\qquad T=\mathrm{PD}\cdot t_d,\qquad S=\left\lceil\frac{T}{W}\right\rceil`,
        explanation:
          "The fitted rate uses the same log-space fit as the growth simulation. Published alternatives are 0.029/h static (24.25 h doubling) and 0.051/h stirred (13.93 h). A non-positive fitted rate falls back to the static rate and is flagged. W is 70 h, beyond which BEL-A counts were reported to decline in static batch culture, so each stage implies a split and medium exchange.",
      },
      {
        id: "target-metabolites",
        name: "Metabolite ceilings for the planned condition",
        latex: String.raw`\begin{aligned}\text{lactate}&<15\,\mathrm{mM}\times 90.08\,\mathrm{g/mol}=1351\ \mathrm{mg/L}\\ \text{ammonia}&<4\,\mathrm{mM}\times 17.03\,\mathrm{g/mol}=68\ \mathrm{mg/L}\end{aligned}`,
        explanation:
          "Inhibition onsets reported in millimolar are converted with the molar masses of lactate and ammonia to match the mg/L units of the DOE fixture. The condition ranked first by expected improvement is checked against these onsets and against the 2640 mg/L lactate with 129 mg/L ammonia combination reported to mediate cell death.",
      },
    ],
    limits:
      "This is arithmetic on a constant-exponential-growth assumption over unverified demo counts. It omits differentiation, enucleation, viability and yield losses, medium volume, feeding schedules, and any release testing, and the blood group is a label that enters no equation because no bundled dataset links a group to culture behaviour. The result is a planning estimate for a researcher to test, not a manufacturing or clinical protocol.",
    refs: ["bayley", "phillips", "timmins", "isbt"],
  },
  {
    id: "monitoring",
    title: "Observed growth & monitoring rules",
    module: "Bioreactor Guard",
    route: "guard",
    engine: "Browser · deterministic monitoring",
    intro:
      "Guard evaluates available recorded samples at the replay cutoff. These rules identify trends and data-quality issues for review.",
    notation:
      "N₀ is the first valid count; Nlast and Nprev are the latest two. tc is the replay cutoff. H is the researcher-selected sample-age limit.",
    equations: [
      {
        id: "observed-growth",
        name: "Fold change, last-interval rate, and percentage change",
        latex: String.raw`\begin{aligned}F&=\frac{N_{\mathrm{last}}}{N_0},\quad g_{\mathrm{last}}=\frac{\ln(N_{\mathrm{last}}/N_{\mathrm{prev}})}{t_{\mathrm{last}}-t_{\mathrm{prev}}}\\ \Delta_\%&=100\frac{N_{\mathrm{last}}-N_{\mathrm{prev}}}{N_{\mathrm{prev}}}\end{aligned}`,
        explanation:
          "These describe measured change. They do not extrapolate a future trajectory. Invalid visible source rows withhold derived growth values until reviewed.",
      },
      {
        id: "monitoring-rules",
        name: "Configured decline and stale-sample checks",
        latex: String.raw`\begin{aligned}N_i&<N_{i-1},\quad 100\frac{N_{i-1}-N_i}{N_{i-1}}\ge D\\ \text{sample age}&=t_c-t_{\mathrm{last}},\quad \text{stale if age}>H\end{aligned}`,
        explanation:
          "A decline warning needs the configured number of consecutive adjacent valid declines, each reaching the percentage threshold D. Missing or invalid rows break the sequence. The stale check runs only when H is enabled. Earlier warnings remain in history.",
      },
    ],
    limits:
      "Thresholds are researcher-defined application rules, not published biological alarm limits. They do not identify a cause or drive equipment. These calculations still run in the frontend; growth simulation and experiment fitting run in Python.",
    refs: ["phillips", "bayley", "timmins"],
  },
  {
    id: "markers",
    title: "Genotype matching",
    module: "RareMatch",
    route: "match",
    engine: "Browser · configurable exact matching",
    intro:
      "RareMatch compares unphased diploid calls to the researcher's selected marker panel. It supports all-marker or any-marker matching and explicit missing-call policies.",
    notation:
      "cᵢ is a usable genotype call and Tᵢ is its target. norm sorts the two DNA letters after treating | and / as unphased separators. A wildcard target accepts any usable call.",
    equations: [
      {
        id: "genotype-matching",
        name: "Match each usable call",
        latex: String.raw`m_i=\mathbf 1\!\left[T_i=*\;\lor\;\operatorname{norm}(c_i)=\operatorname{norm}(T_i)\right]`,
        explanation:
          "All mode requires every applicable mᵢ = 1; any mode requires at least one. Missing or disallowed calls follow the selected unknown / exclude / ignore policy. With no usable calls the result remains unknown, including under ignore.",
      },
    ],
    limits:
      "Built-in calls are synthetic fixtures. An rs identifier names a variant record rather than encoding a coordinate. Gene labels, genome build, strand orientation, and permitted alleles need verification for real inputs. A genotype signature alone does not certify blood compatibility.",
    refs: ["isbt", "dbsnp"],
  },
] as const
