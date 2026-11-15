const regionCodes = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/);
const names = new Intl.DisplayNames(["en"], { type: "region" });
const origins = new Map(regionCodes.flatMap(code => [
  [names.of(code).toLowerCase(), code],
  [code.toLowerCase(), code],
]));

// Match explicit aliases, not country-name substrings in mixed or international origins.
const aliases = [
  ["CZ", ["Czech Republic"]],
  ["TR", ["Turkey", "T\u00fcrkiye"]],
  ["HK", ["Hong Kong", "Hong Kong SAR"]],
  ["MO", ["Macau", "Macao"]],
  ["KR", ["Republic of Korea"]],
  ["US", ["United States of America", "USA", "United States (West Virginia)"]],
  ["GB", ["UK", "United Kingdom (England)", "United Kingdom (Northern Ireland)", "United Kingdom (Scotland)", "United Kingdom (Wales)"]],
  ["AU", ["Australia (states)"]],
  ["BE", ["Belgium (Flanders)", "Belgium (French Community)"]],
  ["CA", ["Canada (Alberta)", "Canada (British Columbia)", "Canada (Ontario)", "Canada (Quebec)"]],
  ["DE", ["Germany (Bavaria)"]],
  ["IT", ["Italy (Lombardy)"]],
  ["ES", ["Spain (Balearic Islands)", "Spain (Basque Country)", "Spain (Catalonia)", "Spain (Galicia)", "Spain (Valencia)"]],
  ["AE", ["United Arab Emirates (Dubai)"]],
  ["EU", ["EU", "European Union", "EU-wide", "EU-wide (Erasmus+)", "EU-wide (FR-led)", "EU-wide (Horizon 2020)"]],
];
for (const [code, labels] of aliases) {
  for (const label of labels) origins.set(label.toLowerCase(), code);
}

export function countryFlag(origin) {
  if (typeof origin !== "string") return null;
  const code = origins.get(origin.trim().toLowerCase());
  return code
    ? String.fromCodePoint(...[...code].map(letter => 0x1f1e6 + letter.charCodeAt(0) - 65))
    : null;
}
