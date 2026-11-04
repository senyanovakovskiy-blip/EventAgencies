const mix = (a, b, amount) => a.map((value, index) => Math.round(value * (1 - amount) + b[index] * amount));
const distance = (a, b) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
export const neutralPalette = { base: [113, 115, 109], primary: [113, 115, 109], secondary: [113, 115, 109] };

// A tiny image sample, grouped by hue and brightness. Neutral highlights and
// black borders do not outweigh the photograph's actual colours.
export function photoPalette(pixels) {
  const buckets = new Map();
  let total = 0, average = [0, 0, 0];
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 200) continue;
    const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const high = Math.max(...rgb), low = Math.min(...rgb), delta = high - low;
    if (high < 24 || low > 238) continue;
    let hue = 0;
    if (delta) {
      hue = high === rgb[0] ? (rgb[1] - rgb[2]) / delta : high === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2 : (rgb[0] - rgb[1]) / delta + 4;
      hue = (hue * 60 + 360) % 360;
    }
    const saturation = delta / Math.max(high, 1);
    const key = `${saturation < .12 ? 12 : Math.floor(hue / 30)}:${Math.floor((high + low) / 172)}`;
    const bucket = buckets.get(key) || { sum: [0, 0, 0], count: 0, saturation: 0 };
    rgb.forEach((value, channel) => { bucket.sum[channel] += value; average[channel] += value; });
    bucket.count++; bucket.saturation += saturation; total++; buckets.set(key, bucket);
  }
  if (!total) return neutralPalette;
  average = average.map(value => value / total);
  const candidates = [...buckets.values()].filter(bucket => bucket.count >= total * .025).map(bucket => ({
    rgb: bucket.sum.map(value => value / bucket.count),
    score: bucket.count * (.35 + bucket.saturation / bucket.count),
  })).sort((a, b) => b.score - a.score);
  if (!candidates.length) return { base: average, primary: average, secondary: average };
  const primary = candidates[0].rgb;
  const secondary = candidates.slice(1).sort((a, b) => b.score * distance(b.rgb, primary) - a.score * distance(a.rgb, primary))[0]?.rgb || primary;
  return { base: mix(average, primary, .6), primary, secondary };
}

export function luminance(rgb) {
  return rgb.reduce((sum, value, index) => {
    const channel = value / 255;
    return sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
  }, 0);
}

// Keep every endpoint inside a readable range, in both themes. CSS interpolates
// real background colours, so an interrupted transition starts where it is now.
export function paletteSurfaces(palette, dark) {
  const surface = (rgb, amount, limit) => {
    let color = mix(dark ? [12, 14, 17] : [249, 247, 243], rgb, amount);
    for (let step = 0; step < 30 && (dark ? luminance(color) > limit : luminance(color) < limit); step++) color = mix(color, dark ? [0, 0, 0] : [255, 255, 255], .05);
    return color;
  };
  return dark ? {
    base: surface(palette.base, .27, .028),
    primary: surface(palette.primary, .53, .065),
    secondary: surface(palette.secondary, .43, .05),
  } : {
    base: surface(palette.base, .12, .76),
    primary: surface(palette.primary, .26, .72),
    secondary: surface(palette.secondary, .21, .74),
  };
}
