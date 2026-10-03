// Synthetic visual comparison data. Never imported by application code.
import { readFileSync } from 'node:fs'
const source = JSON.parse(readFileSync(new URL('./safe-strategy-v2.json', import.meta.url), 'utf8'))
const clone = (value) => JSON.parse(JSON.stringify(value))
export function buildPresentationFixtures() {
  const detail = clone(source.richDetail)
  Object.assign(detail, {
    title: 'Synthetic Expedition',
    attribution: clone(source.row.attribution),
    tags: ['originator', 'divination', 'kalguur', 'trarthus', 'delirium', 'astrolabe-templar'],
    score: 4,
    published_at: '2026-09-07T00:00:00.000Z',
    updated_at: '2026-09-20T00:00:00.000Z',
    notes: 'Synthetic recorded run. Prices are historical; duplicate scarabs are intentional.'
  })
  detail.setup.scarabs = [
    { name: 'Trarthan Scarab of Infamy', price_each_chaos: 16 },
    { name: 'Kalguuran Scarab', price_each_chaos: 1.3 },
    { name: 'Horned Scarab of Awakening', price_each_chaos: 83 },
    { name: 'Divination Scarab of Plenty', price_each_chaos: 12 },
    { name: 'Divination Scarab of Plenty', price_each_chaos: 12 }
  ]
  Object.assign(detail.setup, {
    map_type: '6-mod',
    group_play: false,
    party_size: 1,
    chisel: "Maven's Chisel of Divination",
    delirium: { type: 'Fine', count_per_map: 1 },
    astrolabe: 'Templar Astrolabe',
    run_regex: '"quantity"',
    slam_regex: '"pack size"'
  })
  detail.setup.atlas = { url: null, points: 138, points_max: 138 }
  Object.assign(detail.observed, {
    map_count: 72,
    mod_average: 6,
    mod_sample_size: 72,
    quantity_average: 84,
    rarity_average: 81,
    pack_size_average: 52,
    currency_average: 42,
    multiplier_average: 1.59
  })
  Object.assign(detail.economics, {
    all_in_cost_per_map_chaos: 213.5,
    recurring_cost_per_map_chaos: 213.5,
    total_invest_chaos: 15372,
    net_profit_chaos: 18801,
    net_per_map_divines: 18801 / 215 / 72,
    historical_net_divines: 18801 / 215,
    historical_invest_divines: 15372 / 215
  })
  Object.assign(detail.coverage, {
    run_count: 1,
    map_count: 72,
    timed_run_count: 1,
    timed_map_count: 72,
    timed_minutes: 138,
    timed_net_divines: 18801 / 215,
    net_divines_per_hour: 18801 / 215 / 2.3,
    loot_available: true
  })
  const costs = {
    chisel: { name: "Maven's Chisel of Divination", price_each_chaos: 50 },
    scarabs: clone(detail.setup.scarabs),
    delirium: { type: 'Fine', count_per_map: 1, price_each_chaos: 18 },
    astrolabe: { type: 'Templar Astrolabe', count: 13, price_each_chaos: 62 }
  }
  const categories = [
    ['Currency', 17400],
    ['Other', 8073],
    ['Scarabs', 6670],
    ['Maps', 1300],
    ['League', 300],
    ['Fragments', 210],
    ['Essences', 170],
    ['Oils', 50]
  ]
  const names = [
    'Divine Orb',
    'Recorded miscellaneous loot',
    'Horned Scarab of Awakening',
    'Nightmare Map',
    'Kalguuran Incubator',
    'Grand Eldritch Ichor',
    'Deafening Essence of Greed',
    'Golden Oil'
  ]
  Object.assign(detail.loot, {
    categories: categories.map(([category, value_chaos]) => ({ category, value_chaos })),
    rows: categories.map(([category, value_chaos], i) => ({
      name: names[i],
      category,
      value_chaos,
      source: 'wealthyexile',
      quantity: i === 0 ? 80 : 10,
      note: null,
      identity: null,
      valuation:
        i === 0
          ? {
              baseline_quantity: 0,
              current_quantity: 80,
              baseline_value_chaos: 0,
              current_value_chaos: 17400
            }
          : null
    })),
    has_baseline: true,
    manual_total_chaos: 0,
    inventory_flow_chaos: 34173,
    market_revaluation_chaos: 0,
    csv_positive_chaos: 34173,
    csv_negative_chaos: 0,
    csv_net_chaos: 34173,
    csv_adjustment_chaos: 0,
    gem_correction_chaos: 0,
    investment_correction_chaos: 0,
    reported_return_chaos: 34173,
    omitted_csv_rows: 282,
    omitted_csv_value_chaos: 0,
    omitted_manual_rows: 0,
    omitted_manual_value_chaos: 0
  })
  detail.ancillary.observed_delirium = {
    sample_size: 72,
    levels: [{ percentage: 20, count: 72 }],
    rewards: [{ name: 'Currency', count: 72 }]
  }
  const run = clone(source.run)
  Object.assign(run.setup, {
    ...clone(detail.setup),
    scarabs: detail.setup.scarabs.map((s) => s.name)
  })
  delete run.setup.atlas
  delete run.setup.run_regex
  delete run.setup.slam_regex
  run.observed = { ...detail.observed, multiplier: 1.59 }
  delete run.observed.multiplier_average
  Object.assign(run.economics, {
    recurring_cost_per_map_chaos: 213.5,
    total_invest_chaos: 15372,
    net_profit_chaos: 18801,
    net_per_map_divines: detail.economics.net_per_map_divines,
    divine_price_chaos: 215
  })
  run.timing.reported_minutes = 138
  run.cost_breakdown = clone(costs)
  run.display_cost_breakdown = clone(costs)
  run.loot = clone(detail.loot)
  detail.authored_history = {
    observed: clone(run.observed),
    economics: clone(run.economics),
    timing: clone(run.timing),
    setup_display: {
      source: 'structured',
      authored_map_count: 72,
      cost_breakdown: costs,
      combined_map_rolling_cost_per_map_chaos: 10
    }
  }
  Object.assign(detail.reusable_setup.value, {
    title: detail.title,
    notes: detail.notes,
    mapType: '6-mod',
    chisel: detail.setup.chisel,
    scarabs: detail.setup.scarabs.map((s) => s.name),
    delirium: { type: 'Fine', countPerMap: 1 },
    astrolabe: detail.setup.astrolabe,
    atlasTreeUrl: null,
    reference: {
      maps: 72,
      quantity: 84,
      rarity: 81,
      packSize: 52,
      currency: 42,
      mapFamily: 'originator',
      slamRegex: '"pack size"'
    }
  })
  detail.continuation_setup = clone(source.detail.continuation_setup)
  Object.assign(detail.continuation_setup.seed, {
    ...run.setup,
    league_key: 'allflame',
    multiplier_milli: 1590,
    atlas_tree_url: null
  })
  detail.lifecycle.continuation_reason = null
  const titles = [
    'Synthetic Expedition',
    'Synthetic Night Zoo',
    'Synthetic Group Run',
    'Synthetic Long Name',
    'Synthetic Unnamed',
    'Synthetic Retired Name',
    'Synthetic Missing Evidence',
    'Synthetic Loss',
    'Synthetic Zero',
    'Synthetic Archive Study'
  ]
  const entries = titles.map((title, i) => {
    const d = clone(detail),
      rs = [clone(run)]
    d.id = i === 0 ? source.row.id : `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`
    d.title = title
    d.score = i === 7 ? -2 : i
    d.revision = (i % 3) + 1
    if (i === 1 || i === 2) {
      rs.push({ ...clone(run), ordinal: 2 })
      rs[1].economics.divine_price_chaos = 300
      rs[1].economics.net_per_map_divines = 18801 / 300 / 72
      d.authored_history.economics = clone(rs[1].economics)
      for (const key of ['inventory_flow_chaos', 'csv_positive_chaos', 'csv_net_chaos', 'reported_return_chaos']) d.loot[key] *= 2
      for (const category of d.loot.categories) category.value_chaos *= 2
      for (const row of d.loot.rows) {
        row.value_chaos *= 2
        row.quantity *= 2
        if (row.valuation) for (const key of Object.keys(row.valuation)) row.valuation[key] *= 2
      }
      d.ancillary.observed_delirium.sample_size = 144
      d.ancillary.observed_delirium.levels[0].count = 144
      d.ancillary.observed_delirium.rewards[0].count = 144
      Object.assign(d.coverage, {
        run_count: 2,
        map_count: 144,
        timed_run_count: 2,
        timed_map_count: 144,
        timed_minutes: 276,
        timed_net_divines: 18801 / 215 + 18801 / 300,
        net_divines_per_hour: (18801 / 215 + 18801 / 300) / 4.6
      })
      d.observed.map_count = d.observed.mod_sample_size = 144
      Object.assign(d.economics, {
        total_invest_chaos: 30744,
        net_profit_chaos: 37602,
        historical_net_divines: 18801 / 215 + 18801 / 300,
        historical_invest_divines: 15372 / 215 + 15372 / 300,
        net_per_map_divines: (18801 / 215 + 18801 / 300) / 144
      })
      if (i === 2) {
        d.setup.group_play = true
        d.setup.party_size = 3
        for (const r of rs) { r.setup.group_play = true; r.setup.party_size = 3 }
      }
    }
    if (i === 3) {
      d.attribution.display_name = 'SyntheticAuthorNameAtMaximumSize'
      d.tags.push('__proto__', 'constructor')
      d.loot.categories.push({ category: '__proto__', value_chaos: 0 })
    }
    if (i === 4) d.attribution = null
    if (i === 5) {
      d.attribution.display_name = null
      d.attribution.status = 'retired'
    }
    if (i === 6) {
      d.loot = null
      d.authored_history = null
      d.score = null
      Object.keys(d.economics).forEach((k) => {
        d.economics[k] = null
      })
      Object.keys(d.observed).forEach((k) => {
        d.observed[k] = null
      })
      Object.keys(d.coverage).forEach((k) => {
        d.coverage[k] = k === 'loot_available' ? false : null
      })
      d.setup.scarabs.forEach((s) => {
        s.price_each_chaos = null
      })
      rs.length = 0
    }
    if (i === 7 || i === 8) {
      d.economics.net_profit_chaos = i === 7 ? -2150 : 0
      d.economics.historical_net_divines = i === 7 ? -10 : 0
      d.economics.net_per_map_divines = i === 7 ? -10 / 72 : 0
      Object.assign(rs[0].economics, { net_profit_chaos: d.economics.net_profit_chaos, net_per_map_divines: d.economics.net_per_map_divines })
      d.authored_history.economics = clone(rs[0].economics)
      d.coverage.timed_net_divines = d.economics.historical_net_divines
      d.coverage.net_divines_per_hour = d.economics.historical_net_divines / 2.3
      // These examples deliberately carry no loot detail, not contradictory gains.
      d.loot = rs[0].loot = null
      d.coverage.loot_available = false
    }
    if (d.reusable_setup.status === 'available') {
      d.reusable_setup.value.title = title
      d.reusable_setup.value.party = { group: d.setup.group_play, size: d.setup.party_size }
    }
    if (d.attribution?.status !== 'active') {
      d.continuation_setup = { status: 'unavailable', reason: 'inactive_registration' }
      d.lifecycle.continuation_reason = 'inactive_registration'
    }
    const row = clone(source.row)
    for (const key of [
      'id',
      'title',
      'tags',
      'league',
      'attribution',
      'published_at',
      'updated_at',
      'score',
      'revision'
    ])
      row[key] = clone(d[key])
    row.map_type = d.setup.map_type
    row.group_play = d.setup.group_play
    row.party_size = d.setup.party_size
    row.observed = {
      map_count: d.observed.map_count,
      mod_average: d.observed.mod_average,
      mod_sample_size: d.observed.mod_sample_size
    }
    row.results = {
      all_in_cost_per_map_chaos: d.economics.all_in_cost_per_map_chaos,
      net_per_map_divines: d.economics.net_per_map_divines,
      net_divines_per_hour: d.coverage.net_divines_per_hour,
      total_invest_chaos: d.economics.total_invest_chaos,
      net_profit_chaos: d.economics.net_profit_chaos,
      historical_net_divines: d.economics.historical_net_divines,
      historical_invest_divines: d.economics.historical_invest_divines
    }
    row.evidence = {
      run_count: d.coverage.run_count,
      timed_run_count: d.coverage.timed_run_count,
      timed_map_count: d.coverage.timed_map_count
    }
    return { row, detail: d, runs: rs }
  })
  return { entries, snapshot: source.snapshot, readVersion: source.row.read_version }
}
