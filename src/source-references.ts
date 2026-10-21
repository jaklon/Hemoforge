export const sourceReferences = [
  {
    name: "BEL-A · University of Bath",

    id: "BATH-01456",

    scope: "Static culture growth and metabolite DOE",

    details:
      "Proposal: 3 growth replicates × 8 timepoints; 12 separate DOE runs. Source timing extends to about 171h; the unverified UI fixture ends at 168h.",

    url: "https://doi.org/10.15125/BATH-01456",

    license: "CC BY 4.0 (proposal)",

    module: "Guard / CulturePlan",
  },

  {
    name: "Human erythroid transcriptomes",

    id: "GSE53983",

    scope: "Reference stage classification",

    details:
      "Proposal: 15 human samples, 5 stages × 3 replicates. Not a 21-day culture time series and not paired with BEL-A.",

    url: "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE53983",

    license: "Check source terms",

    module: "ErythroPilot reference",
  },

  {
    name: "1000 Genomes · Phase 3",

    id: "1000G-P3",

    scope: "Population genotype reference",

    details:
      "Proposal: KEL rs8176058 and SLC14A1 rs1058396. Sample IDs and GRCh38 allele orientation require verification before screening real profiles.",

    url: "https://www.internationalgenome.org/data/",

    license: "Check source terms",

    module: "RareMatch",
  },
]
