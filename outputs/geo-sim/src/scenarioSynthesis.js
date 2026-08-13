const PURPOSES = Object.freeze({
  systems_learning: { en: "Systems learning", zh: "系统教学" },
  hypothesis_exploration: { en: "Hypothesis exploration", zh: "假设探索" },
  intervention_comparison: { en: "Intervention comparison", zh: "干预对比" },
  risk_communication: { en: "Risk communication", zh: "风险沟通" },
  validation_design: { en: "Validation design", zh: "验证设计" }
});

const STATUS = Object.freeze({
  evidence_constrained: { en: "Evidence constrained", zh: "证据约束" },
  procedural_baseline: { en: "Procedural baseline", zh: "程序基线" },
  partially_represented: { en: "Partially represented", zh: "部分表达" },
  attention_required: { en: "Attention required", zh: "需要补充" },
  inactive_baseline: { en: "No intervention", zh: "无干预基线" }
});

const PRIORITY = Object.freeze({
  high: { en: "High", zh: "高" },
  medium: { en: "Medium", zh: "中" },
  low: { en: "Low", zh: "低" }
});

export function buildScenarioSynthesis(model, params = {}, options = {}) {
  if (!model?.stats) throw new Error("A completed GeoLab model is required for scenario synthesis");
  const stats = model.stats;
  const confidence = stats.dataConfidence || {};
  const fractions = confidence.domainFractions || {};
  const readiness = Number.isFinite(Number(stats.dataReadiness?.scorePct))
    ? clamp(stats.dataReadiness.scorePct, 0, 100)
    : percentLike(confidence.meanObservedSupport, true);
  const purposeCode = PURPOSES[options.purpose] ? options.purpose : "systems_learning";
  const infrastructureActive = Boolean(stats.externalInfrastructure?.affectedCellCount || stats.infrastructureBudget?.affectedAreaKm2);
  const ecologyEvidence = mean([fraction(fractions.landcover), fraction(fractions.vegetation)]);
  const hydrologyEvidence = Math.max(
    fraction(fractions.flowlines),
    stats.calibration?.advisor?.status && stats.calibration.advisor.status !== "not-calibrated"
      ? percentLike(stats.calibration.advisor.overallScore, true)
      : 0
  );

  const domains = [
    domain("terrain", "Terrain", "地形", model.height?.length ? 100 : 0, fraction(fractions.dem), {
      en: `${format(stats.meanElevation, 0)} m mean elevation, ${format(stats.meanSlope, 1)} degrees mean slope, ${format(stats.meanRoughness, 1)} m mean roughness.`,
      zh: `平均高程 ${format(stats.meanElevation, 0)} m，平均坡度 ${format(stats.meanSlope, 1)} 度，平均粗糙度 ${format(stats.meanRoughness, 1)} m。`
    }, {
      meanElevationM: numberOrNull(stats.meanElevation),
      maxElevationM: numberOrNull(stats.maxElevation),
      meanSlopeDeg: numberOrNull(stats.meanSlope),
      meanRoughnessM: numberOrNull(stats.meanRoughness),
      ecologicalBlockAreaClosurePct: numberOrNull(stats.landscapeNetwork?.mapAreaClosurePct)
    }),
    domain("climate", "Climate & wind", "气候与风", finiteCount([stats.meanPrecipitation, stats.meanTemperature, stats.meanWindSpeed]) / 3 * 100, fraction(fractions.meteorology), {
      en: `${format(stats.meanPrecipitation, 0)} mm/yr precipitation, ${format(stats.meanTemperature, 1)} C mean temperature, ${format(stats.meanWindSpeed, 1)} m/s mean wind.`,
      zh: `年均降水 ${format(stats.meanPrecipitation, 0)} mm，平均温度 ${format(stats.meanTemperature, 1)} C，平均风速 ${format(stats.meanWindSpeed, 1)} m/s。`
    }, {
      meanPrecipitationMmYr: numberOrNull(stats.meanPrecipitation),
      meanTemperatureC: numberOrNull(stats.meanTemperature),
      meanWindSpeedMs: numberOrNull(stats.meanWindSpeed),
      meanReferenceEvapotranspirationMmYr: numberOrNull(stats.meanPotentialEvapotranspiration),
      meanNetRadiationMjM2Day: numberOrNull(stats.meanNetRadiationMjM2Day),
      meanVaporPressureDeficitKPa: numberOrNull(stats.meanVaporPressureDeficitKPa),
      dominantClimateCode: stats.dominantClimate ?? null
    }),
    domain("hydrology", "Water & sediment", "水文与泥沙", mean([
      stats.riverSegmentCount > 0 ? 100 : 45,
      stats.waterBudget ? 100 : 0,
      stats.hydraulicDiagnostics ? 100 : 0
    ]), hydrologyEvidence, {
      en: `${String(stats.flowRouting || params.flowRouting || "d8").toUpperCase()} routing, ${format(stats.mainChannelLengthKm, 1)} km main channel, runoff coefficient ${format(stats.meanRunoffCoefficient, 2)}.`,
      zh: `${String(stats.flowRouting || params.flowRouting || "d8").toUpperCase()} 汇流，主河道 ${format(stats.mainChannelLengthKm, 1)} km，径流系数 ${format(stats.meanRunoffCoefficient, 2)}。`
    }, {
      flowRouting: stats.flowRouting || params.flowRouting || "d8",
      mainChannelLengthKm: numberOrNull(stats.mainChannelLengthKm),
      riverSegmentCount: stats.riverSegmentCount || 0,
      meanRunoffCoefficient: numberOrNull(stats.meanRunoffCoefficient),
      waterBudgetResidualPct: numberOrNull(stats.waterBudget?.residualPctOfInput),
      groundwaterRechargeVolumeM3: numberOrNull(stats.waterBudget?.groundwaterRechargeVolumeM3),
      soilStorageChangeVolumeM3: numberOrNull(stats.waterBudget?.soilStorageChangeVolumeM3),
      processIntegrityIndex: numberOrNull(stats.physicalCoupling?.processIntegrityIndex),
      couplingIntegrityIndex: numberOrNull(stats.physicalCoupling?.couplingIntegrityIndex),
      highErosionAreaKm2: numberOrNull(stats.hydraulicDiagnostics?.highErosionAreaKm2)
    }),
    domain("ecology", "Ecology & wildlife", "生态与动物", mean([
      stats.landscapeNetwork?.blockCount > 0 ? 100 : 0,
      stats.wildlife?.speciesCount > 0 ? 100 : 0,
      Number.isFinite(stats.meanVegetation) ? 100 : 0
    ]), ecologyEvidence, {
      en: `${stats.landscapeNetwork?.blockCount || 0} ecological blocks, ${format(stats.landscapeNetwork?.coreHabitatAreaKm2, 1)} km2 core-habitat proxy, integrity screening ${format((stats.wildlife?.ecologicalIntegrityIndex || 0) * 100, 0)}%.`,
      zh: `${stats.landscapeNetwork?.blockCount || 0} 个生态区块，核心生境代理 ${format(stats.landscapeNetwork?.coreHabitatAreaKm2, 1)} km2，完整性筛查 ${format((stats.wildlife?.ecologicalIntegrityIndex || 0) * 100, 0)}%。`
    }, {
      blockCount: stats.landscapeNetwork?.blockCount || 0,
      meanConnectivity: numberOrNull(stats.landscapeNetwork?.meanConnectivity),
      coreHabitatAreaKm2: numberOrNull(stats.landscapeNetwork?.coreHabitatAreaKm2),
      effectiveHabitatAreaKm2: numberOrNull(stats.landscapeNetwork?.effectiveHabitatAreaKm2),
      meanClimateVegetationConsistency: numberOrNull(stats.landscapeNetwork?.meanClimateVegetationConsistency),
      activeSpeciesCount: stats.wildlife?.activeSpeciesCount || 0,
      migrationLinkCount: stats.wildlife?.migrationLinkCount || 0,
      meanVegetationFraction: numberOrNull(stats.meanVegetation),
      ecologicalIntegrityIndex: numberOrNull(stats.wildlife?.ecologicalIntegrityIndex),
      shannonDiversity: numberOrNull(stats.wildlife?.shannonDiversity),
      hillNumberQ1: numberOrNull(stats.wildlife?.hillNumberQ1),
      totalBiomassKg: numberOrNull(stats.wildlife?.totalBiomassKg),
      blockedReleaseCount: stats.wildlife?.blockedReleaseCount || 0
    }),
    domain("subsurface", "Subsurface", "地下系统", stats.subsurface ? 100 : 0, Math.max(
      fraction(fractions.subsurface),
      percentLike(stats.subsurface?.meanVoxelObservedSupport, true)
    ), {
      en: stats.subsurface
        ? `${stats.subsurface.layerCount} layers to ${format(stats.subsurface.depthM, 0)} m, ${format(stats.subsurface.meanWaterTableDepthM, 1)} m mean water-table depth.`
        : "No subsurface volume is active.",
      zh: stats.subsurface
        ? `${stats.subsurface.layerCount} 层、深至 ${format(stats.subsurface.depthM, 0)} m，平均地下水位埋深 ${format(stats.subsurface.meanWaterTableDepthM, 1)} m。`
        : "尚未启用地下体积。"
    }, {
      layerCount: stats.subsurface?.layerCount || 0,
      depthM: numberOrNull(stats.subsurface?.depthM),
      meanWaterTableDepthM: numberOrNull(stats.subsurface?.meanWaterTableDepthM),
      meanAquiferPotential: numberOrNull(stats.subsurface?.meanAquiferPotential),
      meanEngineeringRisk: numberOrNull(stats.subsurface?.meanEngineeringRisk)
    }),
    domain("infrastructure", "Built environment", "人造环境", infrastructureActive ? 100 : 65, fraction(fractions.infrastructure), {
      en: infrastructureActive
        ? `${stats.externalInfrastructure?.featureCount || 0} features affect ${format(stats.infrastructureBudget?.affectedAreaKm2, 1)} km2; mean suitability ${format(stats.externalInfrastructure?.meanSuitabilityScore, 2)}.`
        : "No built intervention is active; the scenario retains a no-intervention baseline.",
      zh: infrastructureActive
        ? `${stats.externalInfrastructure?.featureCount || 0} 个设施影响 ${format(stats.infrastructureBudget?.affectedAreaKm2, 1)} km2；平均适配度 ${format(stats.externalInfrastructure?.meanSuitabilityScore, 2)}。`
        : "尚未启用人造干预，情景保持无干预基线。"
    }, {
      active: infrastructureActive,
      featureCount: stats.externalInfrastructure?.featureCount || 0,
      affectedAreaKm2: numberOrNull(stats.infrastructureBudget?.affectedAreaKm2),
      meanSuitabilityScore: numberOrNull(stats.externalInfrastructure?.meanSuitabilityScore),
      storageCapacityM3: numberOrNull(stats.infrastructureBudget?.storageCapacityM3),
      demandVolumeM3Yr: numberOrNull(stats.infrastructureBudget?.waterDemandVolumeM3)
    }, infrastructureActive ? null : "inactive_baseline"),
    domain("hazards", "Time & hazards", "时间与灾害", stats.hazards ? 100 : 0, mean([
      fraction(fractions.dem),
      fraction(fractions.meteorology),
      ecologyEvidence
    ]), {
      en: stats.hazards
        ? `Year ${stats.hazards.currentYear ?? params.currentYear ?? 0} of ${stats.hazards.years ?? params.simulationYears ?? 0}; mean composite indicator ${format(stats.hazards.meanCurrentCompositeHazard ?? stats.hazards.meanCompositeHazard, 2)}.`
        : "No time-dependent hazard state is active.",
      zh: stats.hazards
        ? `第 ${stats.hazards.currentYear ?? params.currentYear ?? 0}/${stats.hazards.years ?? params.simulationYears ?? 0} 年；平均综合指标 ${format(stats.hazards.meanCurrentCompositeHazard ?? stats.hazards.meanCompositeHazard, 2)}。`
        : "尚未启用时间灾害状态。"
    }, {
      currentYear: stats.hazards?.currentYear ?? params.currentYear ?? null,
      simulationYears: stats.hazards?.years ?? params.simulationYears ?? null,
      mode: stats.hazards?.mode || params.disasterMode || null,
      meanCompositeIndicator: numberOrNull(stats.hazards?.meanCurrentCompositeHazard ?? stats.hazards?.meanCompositeHazard)
    }),
    domain("evidence", "Evidence & validation", "证据与验证", stats.dataReadiness ? 100 : 55, readiness, {
      en: `${stats.externalSourceCount || 0} external sources; data-readiness score ${format(readiness, 0)}%. This score measures evidence coverage, not predictive validity.`,
      zh: `${stats.externalSourceCount || 0} 个外部数据源；数据就绪度 ${format(readiness, 0)}%。该分数衡量证据覆盖，不代表预测有效性。`
    }, {
      externalSourceCount: stats.externalSourceCount || 0,
      readinessScorePct: readiness,
      readinessClass: stats.dataReadiness?.class || null,
      meanObservedSupportPct: percentLike(confidence.meanObservedSupport, true),
      calibrationScorePct: percentLike(stats.calibration?.advisor?.overallScore, true)
    })
  ];

  const coverageScorePct = round(mean(domains.map((item) => item.coveragePct)), 1);
  const evidenceScorePct = round(mean(domains.map((item) => item.evidencePct)), 1);
  const couplings = buildCouplings(stats, params, infrastructureActive);
  const priorities = buildPriorities(stats, purposeCode, domains, readiness, infrastructureActive);
  const purpose = PURPOSES[purposeCode];

  return {
    type: "geolab-scenario-synthesis",
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    identity: {
      title: String(options.title || "GeoLab 128 regional scenario").trim() || "GeoLab 128 regional scenario",
      purposeCode,
      purpose,
      notes: String(options.notes || "").trim(),
      domain: {
        sizeKm: numberOrNull(model.sizeKm ?? params.mapSizeKm),
        areaKm2: numberOrNull(model.areaKm2 ?? (Number(model.sizeKm) ** 2)),
        resolution: model.n || Number(params.resolution) || null,
        cellSizeM: numberOrNull((model.cellSizeKm || 0) * 1000)
      }
    },
    maturity: {
      code: "teaching-exploratory-prototype",
      label: { en: "Teaching and exploratory prototype", zh: "教学与探索原型" },
      boundary: {
        en: "Coverage and evidence scores describe scenario completeness, not forecast accuracy, calibration, certification, or professional fitness.",
        zh: "覆盖度与证据分数描述情景完整性，不代表预测精度、校准、认证或专业适用性。"
      }
    },
    overview: {
      coverageScorePct,
      evidenceScorePct,
      activeDomainCount: domains.filter((item) => item.coveragePct >= 75).length,
      evidenceConstrainedDomainCount: domains.filter((item) => item.statusCode === "evidence_constrained").length,
      couplingCount: couplings.length,
      priorityCount: priorities.length,
      headline: {
        en: `${domains.filter((item) => item.coveragePct >= 75).length} of ${domains.length} systems are actively represented; evidence coverage is ${format(evidenceScorePct, evidenceScorePct < 10 ? 1 : 0)}%.`,
        zh: `${domains.filter((item) => item.coveragePct >= 75).length}/${domains.length} 个系统已完整表达；证据覆盖度为 ${format(evidenceScorePct, evidenceScorePct < 10 ? 1 : 0)}%。`
      }
    },
    domains,
    couplings,
    priorities,
    assumptions: [
      "Procedural fields are model states, not observations.",
      "Composite indicators are screening diagnostics and must be interpreted with their component fields.",
      "A domain marked active may still have little or no observational constraint.",
      "Professional use requires scale-specific validation, uncertainty analysis, and qualified review."
    ]
  };
}

export function makeScenarioSynthesisMarkdown(report) {
  if (report?.type !== "geolab-scenario-synthesis") throw new Error("A GeoLab scenario synthesis report is required");
  const lines = [
    `# ${markdownText(report.identity.title)}`,
    "",
    `> ${report.maturity.label.en}. ${report.maturity.boundary.en}`,
    "",
    "## Scenario",
    "",
    `- Purpose: ${report.identity.purpose.en}`,
    `- Domain: ${format(report.identity.domain.sizeKm, 0)} km x ${format(report.identity.domain.sizeKm, 0)} km (${format(report.identity.domain.areaKm2, 0)} km2)`,
    `- Grid: ${report.identity.domain.resolution || "unknown"} x ${report.identity.domain.resolution || "unknown"}; ${format(report.identity.domain.cellSizeM, 1)} m cells`,
    `- Generated: ${report.generatedAt}`,
    report.identity.notes ? `- Notes: ${markdownText(report.identity.notes)}` : null,
    "",
    "## Cross-System Overview",
    "",
    `- Scenario coverage: ${format(report.overview.coverageScorePct, 1)}%`,
    `- Evidence coverage: ${format(report.overview.evidenceScorePct, 1)}%`,
    `- Active systems: ${report.overview.activeDomainCount}/${report.domains.length}`,
    `- Evidence-constrained systems: ${report.overview.evidenceConstrainedDomainCount}/${report.domains.length}`,
    "",
    "| System | State | Coverage | Evidence | Summary |",
    "| --- | --- | ---: | ---: | --- |",
    ...report.domains.map((item) => `| ${item.label.en} | ${item.status.en} | ${format(item.coveragePct, 0)}% | ${format(item.evidencePct, 0)}% | ${markdownCell(item.summary.en)} |`),
    "",
    "## Coupled Signals",
    "",
    ...report.couplings.map((item) => `- **${item.label.en}:** ${item.summary.en}`),
    "",
    "## Priorities",
    "",
    ...(report.priorities.length
      ? report.priorities.map((item) => `- **${item.priority.en} - ${item.domainLabel.en}:** ${item.action.en}`)
      : ["- No immediate completeness priority was identified; retain the prototype boundary and continue validation."]),
    "",
    "## Interpretation Boundary",
    "",
    ...report.assumptions.map((item) => `- ${item}`),
    ""
  ];
  return lines.filter((line) => line !== null).join("\n");
}

function domain(id, en, zh, coveragePct, evidencePct, summary, metrics, statusOverride = null) {
  const coverage = clamp(coveragePct, 0, 100);
  const evidence = clamp(evidencePct, 0, 100);
  const statusCode = statusOverride || domainStatus(coverage, evidence);
  return {
    id,
    label: { en, zh },
    statusCode,
    status: STATUS[statusCode],
    coveragePct: round(coverage, 1),
    evidencePct: round(evidence, 1),
    summary,
    metrics
  };
}

function domainStatus(coverage, evidence) {
  if (coverage < 50) return "attention_required";
  if (coverage < 75) return "partially_represented";
  return evidence >= 35 ? "evidence_constrained" : "procedural_baseline";
}

function buildCouplings(stats, params, infrastructureActive) {
  const rows = [
    {
      id: "terrain-water",
      label: { en: "Terrain to water", zh: "地形到水文" },
      summary: {
        en: `${format(stats.meanSlope, 1)} degrees mean slope feeds ${String(stats.flowRouting || params.flowRouting || "d8").toUpperCase()} routing and ${format(stats.mainChannelLengthKm, 1)} km of main channel.`,
        zh: `平均坡度 ${format(stats.meanSlope, 1)} 度驱动 ${String(stats.flowRouting || params.flowRouting || "d8").toUpperCase()} 汇流和 ${format(stats.mainChannelLengthKm, 1)} km 主河道。`
      }
    },
    {
      id: "climate-water",
      label: { en: "Climate to water balance", zh: "气候到水量平衡" },
      summary: {
        en: `${format(stats.meanPrecipitation, 0)} mm/yr precipitation and ${format(stats.meanActualEvapotranspiration, 0)} mm/yr evapotranspiration yield runoff coefficient ${format(stats.meanRunoffCoefficient, 2)}.`,
        zh: `${format(stats.meanPrecipitation, 0)} mm 年降水与 ${format(stats.meanActualEvapotranspiration, 0)} mm 年蒸散形成径流系数 ${format(stats.meanRunoffCoefficient, 2)}。`
      }
    },
    {
      id: "water-partition-closure",
      label: { en: "Water partition closure", zh: "水量分配闭合" },
      summary: {
        en: `Unresolved annual residual is ${format(stats.waterBudget?.residualPctOfInput, 3)}% of input; recharge is ${format((stats.waterBudget?.groundwaterRechargeVolumeM3 || 0) / 1e6, 1)} million m3/yr and soil storage change is ${format((stats.waterBudget?.soilStorageChangeVolumeM3 || 0) / 1e6, 1)} million m3/yr.`,
        zh: `年水量未闭合余项占输入 ${format(stats.waterBudget?.residualPctOfInput, 3)}%；地下补给 ${format((stats.waterBudget?.groundwaterRechargeVolumeM3 || 0) / 1e6, 1)} 百万 m3/yr，土壤储量变化 ${format((stats.waterBudget?.soilStorageChangeVolumeM3 || 0) / 1e6, 1)} 百万 m3/yr。`
      }
    },
    {
      id: "physical-coupling-gates",
      label: { en: "Physical coupling gates", zh: "物理联动门控" },
      summary: {
        en: `Process integrity ${format((stats.physicalCoupling?.processIntegrityIndex || 0) * 100, 0)}%, coupling integrity ${format((stats.physicalCoupling?.couplingIntegrityIndex || 0) * 100, 0)}%, with ${stats.physicalCoupling?.failedGateCount || 0} failed and ${stats.physicalCoupling?.reviewGateCount || 0} review gates.`,
        zh: `物理过程完整性 ${format((stats.physicalCoupling?.processIntegrityIndex || 0) * 100, 0)}%，联动完整性 ${format((stats.physicalCoupling?.couplingIntegrityIndex || 0) * 100, 0)}%，失败门控 ${stats.physicalCoupling?.failedGateCount || 0}，复核门控 ${stats.physicalCoupling?.reviewGateCount || 0}。`
      }
    },
    {
      id: "surface-ecology",
      label: { en: "Surface to ecology", zh: "地表到生态" },
      summary: {
        en: `${format(stats.meanVegetation * 100, 0)}% mean vegetation and LAI ${format(stats.meanLeafAreaIndex, 1)} support ${stats.landscapeNetwork?.blockCount || 0} linked habitat blocks.`,
        zh: `平均植被覆盖 ${format(stats.meanVegetation * 100, 0)}%、LAI ${format(stats.meanLeafAreaIndex, 1)}，支撑 ${stats.landscapeNetwork?.blockCount || 0} 个联动生境区块。`
      }
    },
    {
      id: "subsurface-water",
      label: { en: "Subsurface to water", zh: "地下到水文" },
      summary: {
        en: `${format(stats.subsurface?.meanWaterTableDepthM, 1)} m mean water-table depth and aquifer potential ${format(stats.subsurface?.meanAquiferPotential, 2)} inform storage and engineering screening.`,
        zh: `平均水位埋深 ${format(stats.subsurface?.meanWaterTableDepthM, 1)} m、含水潜势 ${format(stats.subsurface?.meanAquiferPotential, 2)}，参与储水与工程筛查。`
      }
    },
    {
      id: "time-hazards",
      label: { en: "Time to hazards", zh: "时间到灾害" },
      summary: {
        en: `Year ${stats.hazards?.currentYear ?? params.currentYear ?? 0} carries composite screening indicator ${format(stats.hazards?.meanCurrentCompositeHazard ?? stats.hazards?.meanCompositeHazard, 2)}.`,
        zh: `第 ${stats.hazards?.currentYear ?? params.currentYear ?? 0} 年的综合筛查指标为 ${format(stats.hazards?.meanCurrentCompositeHazard ?? stats.hazards?.meanCompositeHazard, 2)}。`
      }
    }
  ];
  if (infrastructureActive) {
    rows.push({
      id: "infrastructure-surface-water",
      label: { en: "Infrastructure to land and water", zh: "设施到地表与水文" },
      summary: {
        en: `${format(stats.infrastructureBudget?.equivalentImperviousAreaKm2, 1)} km2 equivalent impervious area, ${format(stats.infrastructureBudget?.storageCapacityM3, 0)} m3 storage, and ${format(stats.infrastructureBudget?.waterDemandVolumeM3, 0)} m3/yr demand feed back into the scenario.`,
        zh: `等效不透水面积 ${format(stats.infrastructureBudget?.equivalentImperviousAreaKm2, 1)} km2、调蓄 ${format(stats.infrastructureBudget?.storageCapacityM3, 0)} m3、年需水 ${format(stats.infrastructureBudget?.waterDemandVolumeM3, 0)} m3 反馈到情景。`
      }
    });
  }
  return rows;
}

function buildPriorities(stats, purposeCode, domains, readiness, infrastructureActive) {
  const items = [];
  const add = (id, priorityCode, domainId, en, zh) => {
    const target = domains.find((item) => item.id === domainId);
    items.push({
      id,
      priorityCode,
      priority: PRIORITY[priorityCode],
      domainId,
      domainLabel: target?.label || { en: domainId, zh: domainId },
      action: { en, zh }
    });
  };
  if (readiness < 35) add("evidence-baseline", "high", "evidence", "Import traceable DEM, meteorology, soil, land-cover, and calibration sources before interpreting spatial patterns as site evidence.", "导入可追溯的 DEM、气象、土壤、土地覆盖与校准数据，再把空间格局解释为场地证据。");
  if (!stats.calibration?.observedDischargeM3s && !stats.calibration?.observedSeries) add("flow-calibration", "medium", "hydrology", "Add observed discharge and overlapping meteorology to evaluate water routing and hydrograph behavior.", "加入观测流量及同期气象数据，用于评估汇流和过程线行为。");
  if ((stats.subsurface?.meanVoxelObservedSupport ?? 0) < 0.1) add("subsurface-evidence", "medium", "subsurface", "Add borehole, lithology, groundwater, or geotechnical observations before using underground risk indicators for site decisions.", "补充钻孔、岩性、地下水或岩土观测，再将地下风险指标用于场地决策。");
  if (Number.isFinite(stats.waterBudget?.residualPctOfInput) && Math.abs(stats.waterBudget.residualPctOfInput) > 20) add("water-budget", "high", "hydrology", "Review forcing, runoff, retention, extraction, and deep-loss assumptions because the annual water-budget residual is large.", "年水量平衡余项较大，请检查边界强迫、产流、滞留、取水和深层损失假设。");
  if ((stats.physicalCoupling?.failedGateCount || 0) > 0) add("physical-gate-failure", "high", "hydrology", "Resolve failed conservation or process-direction gates before interpreting the coupled scenario.", "在解释联动情景前，先处理失败的守恒或过程方向门控。");
  if ((stats.physicalCoupling?.reviewGateCount || 0) > 0) add("physical-gate-review", "medium", "hydrology", "Review the limiting physical coupling and its evidence before comparing scenarios as if they were equally constrained.", "复核限制性物理链路及其证据，再比较不同情景，避免把它们视为同等约束。");
  if (Number.isFinite(stats.landscapeNetwork?.meanConnectivity) && stats.landscapeNetwork.meanConnectivity < 0.35) add("ecological-connectivity", "medium", "ecology", "Inspect barriers and habitat continuity before drawing conclusions from wildlife abundance or release scenarios.", "检查阻隔和生境连续性，再解读动物丰度或投放情景。");
  if (Number.isFinite(stats.landscapeNetwork?.meanClimateVegetationConsistency) && stats.landscapeNetwork.meanClimateVegetationConsistency < 0.55) add("climate-vegetation-consistency", "medium", "ecology", "Review potential evapotranspiration, precipitation, vegetation, and biomass inputs because their geographic agreement is weak.", "潜在蒸散、降水、植被与生物量之间的地理一致性偏弱，请复核相关输入。");
  if (Number.isFinite(stats.wildlife?.ecologicalIntegrityIndex) && stats.wildlife.ecologicalIntegrityIndex < 0.4) add("ecological-integrity-components", "medium", "ecology", "Inspect habitat, connectivity, diversity, trophic-resource, and climate-vegetation components instead of relying on the composite integrity screening index.", "请检查生境、连通性、多样性、营养资源和气候—植被分项，不要只依赖综合完整性筛查指数。");
  if ((stats.wildlife?.blockedReleaseCount || 0) > 0) add("blocked-translocation", "high", "ecology", "Do not treat blocked release batches as viable; resolve regional mismatch or absent habitat and complete professional disease, genetic, legal, and field review.", "不要将被拦截的投放批次视为可行；应先解决区域不匹配或缺乏生境，并完成疾病、遗传、法律和现场专业审查。");
  if ((stats.hazards?.meanCurrentCompositeHazard ?? stats.hazards?.meanCompositeHazard ?? 0) > 0.62) add("hazard-components", "medium", "hazards", "Inspect component hazard layers and exposed assets instead of relying on the composite indicator alone.", "检查各分项灾害图层和暴露资产，不要只依赖综合指标。");
  if (purposeCode === "systems_learning") add("systems-learning", "low", "evidence", "Compare at least two controlled configurations and trace how one changed input propagates through the listed coupling pathways.", "对比至少两组受控配置，并沿已列联动链路追踪单一输入变化如何传播。");
  if (purposeCode === "hypothesis_exploration") add("hypothesis-test", "medium", "evidence", "State a directional hypothesis, hold unrelated parameters constant, and define a diagnostic that could contradict it before running variants.", "先提出有方向的假设，固定无关参数，并定义可能否定该假设的诊断指标，再运行变体。");
  if (purposeCode === "intervention_comparison") add(
    infrastructureActive ? "intervention-counterfactual" : "intervention-baseline",
    "medium",
    "infrastructure",
    infrastructureActive
      ? "Export this intervention state, then run a matched no-intervention counterfactual and compare land, water, habitat, hazard, and demand metrics."
      : "Keep this run as the baseline, then add at least one spatially explicit intervention for comparison.",
    infrastructureActive
      ? "导出当前干预状态，再运行参数匹配的无干预反事实，并对比地表、水文、生境、灾害和需水指标。"
      : "保留本次结果作为基线，再加入至少一个空间明确的干预方案进行对比。"
  );
  if (purposeCode === "risk_communication") add("risk-context", "medium", "hazards", "Present component indicators, exposed systems, evidence coverage, and scenario assumptions beside every composite risk statement.", "每项综合风险表述都应同时展示分项指标、暴露系统、证据覆盖和情景假设。");
  if (purposeCode === "validation_design") add("validation-targets", "high", "evidence", "Define measurable target variables, spatial and temporal matching rules, acceptance ranges, and independent holdout observations before calibration.", "在校准前定义可测目标变量、时空匹配规则、接受范围和独立留出观测。");
  if (!items.length) add("validation-case", "low", "evidence", "Preserve this configuration as a reproducible case and define expected diagnostic ranges for future regression and validation work.", "将当前配置保存为可复现实例，并为后续回归和验证定义预期诊断范围。");
  const order = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => order[a.priorityCode] - order[b.priorityCode]);
}

function percentLike(value, normalized = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return clamp(normalized ? number * 100 : number, 0, 100);
}

function fraction(value) {
  return percentLike(value, true);
}

function finiteCount(values) {
  return values.filter(Number.isFinite).length;
}

function mean(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function format(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return number.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? 0 : 0 });
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? round(number, 5) : null;
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function markdownText(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function markdownCell(value) {
  return markdownText(value).replaceAll("|", "\\|");
}
