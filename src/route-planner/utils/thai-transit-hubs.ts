/**
 * Mapping of Thai provinces to their primary transit hubs (airports or bus terminals).
 * Used when a user is far from the destination (>100km) — the route planner
 * substitutes the transit hub as Day 1 starting point.
 */
export interface TransitHub {
  name: string;
  latitude: number;
  longitude: number;
  type: 'airport' | 'bus_terminal';
  advice: string;
}

export const THAI_TRANSIT_HUBS: Record<string, TransitHub> = {
  // --- Provinces with commercial airports ---
  'Chiang Mai': {
    name: 'Chiang Mai International Airport',
    latitude: 18.7669,
    longitude: 98.9625,
    type: 'airport',
    advice: 'Recommended to fly to Chiang Mai Airport (~1h 15m from Bangkok)',
  },
  'Chiang Rai': {
    name: 'Mae Fah Luang International Airport',
    latitude: 19.9523,
    longitude: 99.8828,
    type: 'airport',
    advice: 'Recommended to fly to Chiang Rai Airport (~1h 20m from Bangkok)',
  },
  Phuket: {
    name: 'Phuket International Airport',
    latitude: 8.1132,
    longitude: 98.3169,
    type: 'airport',
    advice: 'Recommended to fly to Phuket Airport (~1h 30m from Bangkok)',
  },
  Krabi: {
    name: 'Krabi International Airport',
    latitude: 8.0955,
    longitude: 98.9862,
    type: 'airport',
    advice: 'Recommended to fly to Krabi Airport (~1h 25m from Bangkok)',
  },
  'Surat Thani': {
    name: 'Surat Thani Airport',
    latitude: 9.1326,
    longitude: 99.1356,
    type: 'airport',
    advice: 'Recommended to fly to Surat Thani Airport (~1h 10m from Bangkok)',
  },
  Trang: {
    name: 'Trang Airport',
    latitude: 7.5088,
    longitude: 99.6167,
    type: 'airport',
    advice: 'Recommended to fly to Trang Airport (~1h 35m from Bangkok)',
  },
  'Nakhon Si Thammarat': {
    name: 'Nakhon Si Thammarat Airport',
    latitude: 8.5396,
    longitude: 99.9447,
    type: 'airport',
    advice:
      'Recommended to fly to Nakhon Si Thammarat Airport (~1h 15m from Bangkok)',
  },
  Songkhla: {
    name: 'Hat Yai International Airport',
    latitude: 6.9332,
    longitude: 100.3928,
    type: 'airport',
    advice: 'Recommended to fly to Hat Yai Airport (~1h 30m from Bangkok)',
  },
  'Udon Thani': {
    name: 'Udon Thani International Airport',
    latitude: 17.3864,
    longitude: 102.7884,
    type: 'airport',
    advice: 'Recommended to fly to Udon Thani Airport (~1h from Bangkok)',
  },
  'Ubon Ratchathani': {
    name: 'Ubon Ratchathani Airport',
    latitude: 15.2513,
    longitude: 104.8701,
    type: 'airport',
    advice:
      'Recommended to fly to Ubon Ratchathani Airport (~1h 10m from Bangkok)',
  },
  'Khon Kaen': {
    name: 'Khon Kaen Airport',
    latitude: 16.4667,
    longitude: 102.7834,
    type: 'airport',
    advice: 'Recommended to fly to Khon Kaen Airport (~55m from Bangkok)',
  },
  'Nakhon Ratchasima': {
    name: 'Nakhon Ratchasima Bus Terminal',
    latitude: 14.9799,
    longitude: 102.0978,
    type: 'bus_terminal',
    advice:
      'Recommended to take a bus to Nakhon Ratchasima (~3h 30m from Bangkok)',
  },
  Loei: {
    name: 'Loei Airport',
    latitude: 17.4391,
    longitude: 101.7223,
    type: 'airport',
    advice: 'Recommended to fly to Loei Airport (~1h from Bangkok)',
  },
  'Nakhon Phanom': {
    name: 'Nakhon Phanom Airport',
    latitude: 17.3838,
    longitude: 104.6428,
    type: 'airport',
    advice:
      'Recommended to fly to Nakhon Phanom Airport (~1h 10m from Bangkok)',
  },
  Lampang: {
    name: 'Lampang Airport',
    latitude: 18.2709,
    longitude: 99.5042,
    type: 'airport',
    advice: 'Recommended to fly to Lampang Airport (~1h 10m from Bangkok)',
  },
  Phitsanulok: {
    name: 'Phitsanulok Airport',
    latitude: 16.7829,
    longitude: 100.2791,
    type: 'airport',
    advice: 'Recommended to fly to Phitsanulok Airport (~55m from Bangkok)',
  },
  Nan: {
    name: 'Nan Nakhon Airport',
    latitude: 18.808,
    longitude: 100.7834,
    type: 'airport',
    advice: 'Recommended to fly to Nan Airport (~1h 15m from Bangkok)',
  },
  'Mae Hong Son': {
    name: 'Mae Hong Son Airport',
    latitude: 19.302,
    longitude: 97.9758,
    type: 'airport',
    advice: 'Recommended to fly to Mae Hong Son Airport (~2h from Bangkok)',
  },
  Ranong: {
    name: 'Ranong Airport',
    latitude: 9.7774,
    longitude: 98.5854,
    type: 'airport',
    advice: 'Recommended to fly to Ranong Airport (~1h 20m from Bangkok)',
  },
  Chumphon: {
    name: 'Chumphon Airport',
    latitude: 10.7112,
    longitude: 99.3617,
    type: 'airport',
    advice: 'Recommended to fly to Chumphon Airport (~1h 10m from Bangkok)',
  },
  Rayong: {
    name: 'U-Tapao International Airport',
    latitude: 12.68,
    longitude: 101.005,
    type: 'airport',
    advice: 'Recommended to fly to U-Tapao Airport (~40m from Bangkok)',
  },
  Narathiwat: {
    name: 'Narathiwat Airport',
    latitude: 6.5199,
    longitude: 101.7434,
    type: 'airport',
    advice: 'Recommended to fly to Narathiwat Airport (~1h 40m from Bangkok)',
  },
  Pattani: {
    name: 'Hat Yai International Airport',
    latitude: 6.9332,
    longitude: 100.3928,
    type: 'airport',
    advice:
      'Recommended to fly to Hat Yai Airport and drive to Pattani (~1h 30m flight + 1h drive)',
  },
  Buriram: {
    name: 'Buriram Airport',
    latitude: 15.2295,
    longitude: 103.2535,
    type: 'airport',
    advice: 'Recommended to fly to Buriram Airport (~1h from Bangkok)',
  },
  'Sakon Nakhon': {
    name: 'Sakon Nakhon Airport',
    latitude: 17.1951,
    longitude: 104.1186,
    type: 'airport',
    advice: 'Recommended to fly to Sakon Nakhon Airport (~1h 10m from Bangkok)',
  },
  'Roi Et': {
    name: 'Roi Et Airport',
    latitude: 16.1168,
    longitude: 103.7738,
    type: 'airport',
    advice: 'Recommended to fly to Roi Et Airport (~1h from Bangkok)',
  },

  // --- Provinces with bus terminals (no commercial airport nearby) ---
  Kanchanaburi: {
    name: 'Kanchanaburi Bus Terminal',
    latitude: 14.0228,
    longitude: 99.5328,
    type: 'bus_terminal',
    advice:
      'Recommended to drive or take a bus to Kanchanaburi (~2h 30m from Bangkok)',
  },
  Sukhothai: {
    name: 'Sukhothai Airport',
    latitude: 17.238,
    longitude: 99.8183,
    type: 'airport',
    advice: 'Recommended to fly to Sukhothai Airport (~1h 20m from Bangkok)',
  },
  Phetchabun: {
    name: 'Phetchabun Bus Terminal',
    latitude: 16.4191,
    longitude: 101.1604,
    type: 'bus_terminal',
    advice: 'Recommended to take a bus to Phetchabun (~5h from Bangkok)',
  },
  'Prachuap Khiri Khan': {
    name: 'Hua Hin Airport',
    latitude: 12.6361,
    longitude: 99.9515,
    type: 'airport',
    advice: 'Recommended to fly to Hua Hin Airport (~45m from Bangkok)',
  },
  Tak: {
    name: 'Tak Bus Terminal',
    latitude: 16.8839,
    longitude: 99.1254,
    type: 'bus_terminal',
    advice: 'Recommended to take a bus to Tak (~5h from Bangkok)',
  },
  Phang_Nga: {
    name: 'Phuket International Airport',
    latitude: 8.1132,
    longitude: 98.3169,
    type: 'airport',
    advice:
      'Recommended to fly to Phuket Airport and drive to Phang Nga (~1h 30m flight + 1h drive)',
  },
  'Phang Nga': {
    name: 'Phuket International Airport',
    latitude: 8.1132,
    longitude: 98.3169,
    type: 'airport',
    advice:
      'Recommended to fly to Phuket Airport and drive to Phang Nga (~1h 30m flight + 1h drive)',
  },
};

/**
 * Find the transit hub for a province name.
 * Falls back to null if no known hub exists.
 */
export function getTransitHub(provinceName: string): TransitHub | null {
  // Try exact match first
  if (THAI_TRANSIT_HUBS[provinceName]) {
    return THAI_TRANSIT_HUBS[provinceName];
  }

  // Case-insensitive match
  const lowerName = provinceName.toLowerCase();
  for (const [key, hub] of Object.entries(THAI_TRANSIT_HUBS)) {
    if (key.toLowerCase() === lowerName) {
      return hub;
    }
  }

  return null;
}
