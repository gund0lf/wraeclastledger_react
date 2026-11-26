// Shared by Discord card presentation and the desktop size preview.
function compactPrice(value) {
  return value.toFixed(1).replace(/\.0+$/, '');
}

export function covensExportLines(fields, maps, totalOrbCost, cardLabels) {
  const observed = metric => metric ? `${compactPrice(metric.sum / metric.count)}% (${metric.count} maps)` : 'unknown';
  const quote = value => value ? `${compactPrice(value.amount)}${value.unit === 'chaos' ? 'c' : 'd'}` : 'price unknown';
  const lines = [`**Atlas Drops:** ${observed(fields.atlas_drops)} | **More Threads:** ${observed(fields.more_threads)}`];
  if (fields.threads?.length) {
    lines.push('\uD83E\uDDF5 **Threads:**');
    for (const row of fields.threads) {
      lines.push(`• ${cardLabels.items[row.id]} · ${row.paid} paid + ${row.granted} granted${row.paused ? ' · paused' : ''} · ${quote(row.price_each)}`);
    }
  }
  if (fields.ember) lines.push(`\uD83D\uDD25 **Ember:** ${cardLabels.items[fields.ember.id]} (${quote(fields.ember.price_each)})`);
  if (fields.atlas?.choices.length) {
    lines.push('**Atlas choices:** ' + fields.atlas.choices.map(({node, option}) => {
      const entry = cardLabels.choices[node];
      const selection = entry.options.find(o => o.id === String(option));
      return `${entry.name} — ${selection?.text ?? 'choice unknown'}`;
    }).join(' · '));
  }
  if (fields.orbs !== null) {
    const total = totalOrbCost;
    const cost = total === null ? 'cost unknown' : `${compactPrice(total)}c total${maps ? ` · ${compactPrice(total / maps)}c/map` : ''}`;
    lines.push('**Orb spend:** ' + fields.orbs.map(row => `${row.used} × ${cardLabels.items[row.id]} @ ${quote(row.price_each)}`).concat(cost).join(' · '));
  }
  if (fields.delirium) {
    const { levels, rewards, resolution } = fields.delirium;
    const mapCount = count => count === 1 ? '1 map' : count + ' maps';
    lines.push('**Delirium level:** ' + levels.map(([value, count]) => {
      const level = resolution === 'bands' && value ? (value - 9) + '–' + value : value;
      return mapCount(count) + ' at ' + level + '%';
    }).join(' · '));
    if (rewards.length) lines.push('**Reward types:** ' + rewards.map(([reward, count]) =>
      reward[0].toUpperCase() + reward.slice(1) + ' on ' + mapCount(count)).join(' · '));
  }
  if (fields.encounters) {
    const { readable, unknown, confirmed } = fields.encounters;
    lines.push('**Confirmed encounters:** ' + Object.entries(confirmed).map(([family,count]) =>
      `${family[0].toUpperCase() + family.slice(1)} ${count}/${readable}`).concat(`${unknown} unknown`).join(' · '));
  }
  return lines;
}

// Keep the canonical text and structured measurements intact for later readers.
export function compactCovensCard(text) {
  if (!/^\*\*Atlas Drops:\*\* .* \| \*\*More Threads:\*\*/m.test(text)) return text;
  const body = text.replace(/^\*\*Atlas choices:\*\* ([\s\S]*?)(?=\n(?:[^\w\s*]+ )?\*\*|(?![\s\S]))/m, (section, choices) => {
    if (section.length <= 140) return section;
    const names = choices.split(/ · (?=[^·—\n]{1,80} — )/).map(choice => choice.split(' — ')[0]);
    return '**Atlas choices:** ' + (names.join(', ').length <= 100 ? names.join(', ') : names.length + ' allocated') + ' (details in Ledger)';
  });
  return body.split('\n').map(line => {
    if (line.length <= 140) return line;
    if (line.startsWith('**Orb spend:** ')) {
      const parts = line.slice('**Orb spend:** '.length).split(' · ');
      const count = parts.findIndex(part => !/^\d+ × .+ @ .+$/.test(part));
      if (count > 0) return '**Orb spend:** ' + count + ' types · ' + parts.slice(count).join(' · ') + ' (details in Ledger)';
    }
    if (line.startsWith('**Reward types:** ')) {
      const rows = line.slice('**Reward types:** '.length).split(' · ');
      if (rows.every(row => /^.+ on \d+ maps?$/.test(row))) {
        return '**Reward types:** ' + rows.length + ' types (counts in Ledger)';
      }
    }
    if (line.startsWith('**Delirium level:** ')) {
      const levels = [...line.matchAll(/(\d+) maps? at (\d+(?:–\d+)?)%/g)];
      if (!levels.length) return line;
      const maps = levels.reduce((sum, match) => sum + Number(match[1]), 0);
      const bounds = levels.flatMap(match => match[2].split('–').map(Number));
      return '**Delirium level:** ' + maps + ' maps at ' + Math.min(...bounds) + '–' + Math.max(...bounds) + '% (distribution in Ledger)';
    }
    return line;
  }).join('\n');
}
