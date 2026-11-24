// Base rewards per Nightmare affix in the Atlas Drops map pool.
export interface NightmareMapRewards {
  atlasDrops: number;
  rarity: number;
  pack: number;
  currency?: number;
  threads?: number;
  maps?: number;
}

export const NIGHTMARE_BUILDER_REWARDS: Readonly<Record<string, NightmareMapRewards | undefined>> = {
  hap: { atlasDrops: 13, rarity: 11, pack: 20 },
  syn: { atlasDrops: 13, rarity: 8, pack: 20 },
  rch: { atlasDrops: 13, rarity: 8, pack: 20 },
  wni: { atlasDrops: 16, rarity: 8, pack: 20 },
  maxres: { atlasDrops: 19, rarity: 11, pack: 20 },
  maven: { atlasDrops: 13, rarity: 8, pack: 20 },
  xpir: { atlasDrops: 16, rarity: 12, pack: 6, currency: 64 },
  kat: { atlasDrops: 13, rarity: 8, pack: 5, currency: 47 },
  fph: { atlasDrops: 10, rarity: 8, pack: 5, currency: 47 },
  life: { atlasDrops: 13, rarity: 8, pack: 5, currency: 47 },
  sks: { atlasDrops: 16, rarity: 8, pack: 5, currency: 47 },
  wb: { atlasDrops: 13, rarity: 8, pack: 5, currency: 47 },
  tunn: { atlasDrops: 13, rarity: 8, pack: 5, currency: 47 },
  eteor: { atlasDrops: 13, rarity: 8, pack: 5, currency: 45 },
  chain3: { atlasDrops: 16, rarity: 56, pack: 6 },
  poss: { atlasDrops: 16, rarity: 56, pack: 6 },
  aoe: { atlasDrops: 19, rarity: 56, pack: 7 },
  mondam: { atlasDrops: 19, rarity: 56, pack: 7 },
  speed: { atlasDrops: 19, rarity: 28, pack: 7 },
  labyhaz: { atlasDrops: 19, rarity: 27, pack: 5 },
  expres: { atlasDrops: 19, rarity: 11, pack: 20 },
  penet: { atlasDrops: 19, rarity: 36, pack: 6 },
  afflict: { atlasDrops: 13, rarity: 8, pack: 5, threads: 60 },
  volati: { atlasDrops: 13, rarity: 11, pack: 5, threads: 53 },
  curses: { atlasDrops: 13, rarity: 11, pack: 6, threads: 35 },
  defenc: { atlasDrops: 13, rarity: 8, pack: 5, threads: 35 },
  bufscar: { atlasDrops: 10, rarity: 6, pack: 4, threads: 35 },
  marked: { atlasDrops: 16, rarity: 8, pack: 5, threads: 36 },
  grasp: { atlasDrops: 13, rarity: 8, pack: 5, maps: 40 },
  shield: { atlasDrops: 13, rarity: 8, pack: 5, maps: 35 },
  oppress: { atlasDrops: 13, rarity: 8, pack: 5, maps: 35 },
  protect: { atlasDrops: 13, rarity: 8, pack: 5, maps: 35 },
  powchg: { atlasDrops: 13, rarity: 8, pack: 5, maps: 35 },
  frenzchg: { atlasDrops: 13, rarity: 8, pack: 5, maps: 35 },
  endchg: { atlasDrops: 13, rarity: 8, pack: 5, maps: 35 },
  shrine: { atlasDrops: 13, rarity: 8, pack: 5, maps: 35 },
};
