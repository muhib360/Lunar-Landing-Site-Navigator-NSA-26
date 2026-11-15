// Plain-language definitions shown in ⓘ tips. Keep each to one or two short sentences.
// Teammates: edit freely — the keys are used as <Term id="…"> in the UI.
export const GLOSSARY = {
  horizon:
    'The line where the ground meets the sky. On the Moon there is no air, so the horizon is simply the edge of the nearest mountains or of the Moon’s curve.',
  elevation:
    'How high something is in the sky, in degrees. 0° is the horizon, 90° is straight overhead.',
  azimuth: 'The compass direction of something in the sky: 0° north, 90° east, 180° south, 270° west.',
  libration:
    'A slow wobble of the Moon as seen from Earth. From the Moon, it makes Earth drift in a small loop in the sky over each month.',
  lunarDay:
    'One full day–night cycle on the Moon lasts about 29.5 Earth days: roughly two weeks of sunlight, then two weeks of darkness (except near the poles).',
  shadow:
    'Permanently shadowed regions are crater floors near the poles that never see the Sun. They are among the coldest places in the solar system and may hold water ice.',
  dte: 'Direct-to-Earth communication: a radio link straight to antennas on Earth. It only works when Earth is above the landing site’s horizon.',
  verticalPanel:
    'Near the poles the Sun is always low, so solar panels stand upright and turn to follow it around the horizon. Power depends on how much of the Sun is visible.',
  lola: 'LOLA is a laser altimeter on NASA’s Lunar Reconnaissance Orbiter. It measured the height of the Moon’s surface billions of times; we use its maps to find which mountains block the Sun.',
  ephemeris:
    'A table of where the Sun, Earth and planets are at any moment. Ours is computed in your browser and checked against NASA JPL’s Horizons system.',
  southPole:
    'The Moon’s south pole is the target of NASA’s Artemis missions: some ridges get sunlight most of the time, and nearby craters in permanent shadow may contain water ice.',
} as const;

export type TermId = keyof typeof GLOSSARY;
