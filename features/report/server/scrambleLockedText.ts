/**
 * Length- and shape-preserving scramble for copy a locked reader only ever sees
 * under a full blur.
 *
 * WHY. The paywalled Typical Beliefs frames (348:221, 381:222, 381:362, 374:258)
 * draw the rest of the chapter blurred at full length rather than cut off, so the
 * page needs text of the right shape in those places. A CSS blur is paint and
 * nothing more — the words stay in the DOM and in the API response — so sending
 * the real copy there would publish it. Scrambled copy of the same shape looks
 * identical under a 2.5px blur and gives nothing away.
 *
 * WHAT IS KEPT. Every character that is not a letter or a digit passes through
 * untouched — spaces, punctuation, curly quotes, line breaks. Each word becomes a
 * real word of the same length from DECOY_WORDS, with the original's capitals and
 * no letter where the original had the same one; of a handful of seeded candidates,
 * the one closest to it in width wins, so lines break much as the real copy's do.
 * A word no decoy fits — one letter long, or longer than the list goes — keeps the
 * letter scramble: each letter swapped for another of the same case and roughly
 * the same advance (narrow for narrow, wide for wide). Digits are always swapped
 * one by one. A width class is not a glyph width, so a block that only just wraps
 * can still come out a line shorter or longer than the real one.
 *
 * WHY WORDS. The ramps' blur starts light, and there the letter scramble showed
 * through as gibberish (Sanjin, 25.09); words read as text and still say nothing.
 * The list is deliberately plain — objects, places, weather, everyday verbs — with
 * nothing about bodies, desire, power or harm, because decoys land side by side and
 * a chance run must never read as a sentence about the reader.
 *
 * DETERMINISTIC. Seeded from the text itself, so a given string always scrambles
 * the same way: server renders stay stable, and identical inputs cannot be
 * averaged against each other to recover anything.
 *
 * ZERO IMPORTS, deliberately. It is called from the paid-copy data modules, and
 * anything it imported would be dragged in wherever they are.
 */

/** Every character from `from` to `to`, inclusive. */
const span = (from: string, to: string): string =>
  Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) =>
    String.fromCharCode(from.charCodeAt(0) + i)
  ).join("");

const without = (all: string, ...drop: string[]): string =>
  [...all].filter((ch) => !drop.some((d) => d.includes(ch))).join("");

/** Width classes, by typical advance in Plus Jakarta Sans and Lora. */
const LOWER_NARROW = "fijlrt";
const LOWER_WIDE = "mw";
const LOWER_MEDIUM = without(span("a", "z"), LOWER_NARROW, LOWER_WIDE);
const UPPER_NARROW = "IJ";
const UPPER_WIDE = "MW";
const UPPER_MEDIUM = without(span("A", "Z"), UPPER_NARROW, UPPER_WIDE);
const DIGITS = span("0", "9");

const classFor = (ch: string): string | null => {
  if (LOWER_NARROW.includes(ch)) return LOWER_NARROW;
  if (LOWER_WIDE.includes(ch)) return LOWER_WIDE;
  if (LOWER_MEDIUM.includes(ch)) return LOWER_MEDIUM;
  if (UPPER_NARROW.includes(ch)) return UPPER_NARROW;
  if (UPPER_WIDE.includes(ch)) return UPPER_WIDE;
  if (UPPER_MEDIUM.includes(ch)) return UPPER_MEDIUM;
  if (DIGITS.includes(ch)) return DIGITS;
  return null;
};

/**
 * The decoys: plain words, lower case, two letters and up. Kept free of anything
 * about bodies, desire, power or harm (see the header), and of the archetype's
 * own vocabulary ("spark"), so no run of them reads as the report.
 */
const DECOY_TEXT = `
an as at be by go if in is no of on or so to up
add ago aid aim air all and any art ash ask bag bay bee bin bit bud bus
but buy cab can cap car cod cog cup cut dam day den dew dig dim dot dry due
egg elm end era eve fan far fee few fig fin fir fit fix fly fog for fun gap gas
get gum hat hay hen hop hub hue hut icy ink inn ivy jam jar jet jog key kit
lab law led let lid lit log lot low map mat may mix mop mud mug net new nod nor
not now oak oar oat odd off one opt orb ore out owl pad pal pan par
paw pay pea pen per pew pie pin pod pro pun put rag ran ray red rid
rig row rug run rye sat saw say sea see set sew shy sit six ski sky soy
sum sun tab tag tan tar tax tea ten the tin ton too tow try two urn use
van vat via vow was way web why wig win wit won yak yam yes yet yew zip
zoo
able acre also area away axis back bake bale band bank barn base beam bean
bell best bike bill bird blue boat bold bolt book both bowl brim bulb
busy cafe calf calm camp card care cart case cash cave cell chef chip
city clay clue coal coat code coin cold comb cone cook cool copy cord core
corn cost cove crew crow cube curb cyan dark dart data dawn deal deck
deed deer desk dial dice dine dish disk dock dome done door dove down draw drew
drum duck dune dusk dust duty each earn ease east echo edit else even ever
exam exit face fact fade fair fall fame farm fawn fern file find fine
fish five flag flat foam folk fond font food ford fork form fort four free
frog from fuel full fund gain gale gate gave gear gift glad glen glow glue goal
goat gold golf gone good gray grew grid grow gulf gust hail half hall harp have
hawk haze heap help herd here hero hike hill hint hive hold home
hope host hour hull icon idea into iron isle item jade
jazz join joke jury just keel keen keep kelp kept kiln kind kite knit
know lake lamb lamp land lane lark last late lava lawn leaf lean lens less
lift like lily lime line link lion list loaf loan loft logo loom
loop lore lost luck made mail main mall many mark mast math maze meal mean
meet melt memo menu mesh mild mile mill mind mine mint mist mode mold mole
mood moon moor more moss most moth move much muse must myth name navy near
neat nest news next nice nine node none noon norm note noun oath oboe once only
onto oval oven over pack page paid pail pair pale park part pass past
path pave pear peat pier pile pine pint plan plot plum poem
poet pond pool poor port post pour pull pure quay quiz race raft
rail rain rake ramp rang rank rare rate read real reed reef rely rent rest rice rich
rind road roam roar rock role roll roof room rose ruby rule
rune rust saga sage said sail sale salt same sand sang save scan seal seam
seat seek seem seen self sell send sent shed ship shop side sift sign
sill silo sing sink site slab sled slim slip snow soap soar
soda soil sold sole some song soon sort soup sour span spin spot star stay
stem step stew stir such suit sung sure surf swan sway tact take tale
talk tall tank task taxi teal team tell tend tent term test text than that
thaw them then they thin this thus tide tidy tile till time tire toad told toll
tone took tour town tram tray tree trim true tuba tube tuft tuna tune
turf twig type unit upon used user vale vase vast verb very vine
visa volt vote wade wage wait wake walk wall wash wasp wave week well
went were west what when will wind wing wire wise with
wool word wore work worn wrap yard yarn yoga yolk zero zinc zone
about above acorn actor adapt after again agree ahead album alarm alert align
alike alive allow alloy alone along aloud alter amber among ample angle apple
apply apron arena argue arise aroma array arrow aside asset atlas attic audio audit
avoid awake award aware bacon badge bagel baker basic basin basis batch beach began
begin being below bench berry birch black bland blank blend blink block
bloom board bonus boost booth brain brand brass brave bread break brick
brief bring brink broad brook broom brown brush build built bunch cabin cable
canoe cargo carol carry carve cause cedar chair chalk chart
check cheer chess chief chili china chord civic claim clean
clear clerk click cliff climb clock close cloth cloud coach coast cocoa color
comet comic coral count cover craft crane crate creek crest crisp cross
crowd crown crumb crust cycle daily dairy daisy dated dealt decor delay delta dense
depot depth diary digit diner ditch diver doing donor dough dozen draft drain drama
drank drawn dried drift drive dryer dwell eager eagle early earth easel
eight elder elect empty enjoy equal equip erase essay
event every exact exist extra fable false fancy feast fence ferry fetch
fiber field fifth fifty final first flake flash flask fleet flint float flock
floor flora flour flute focus foggy forge forth forty forum found frame
fresh front frost froze fruit fudge fully funny gauge given glass glaze gleam
globe going grace grain grand grant grape graph grasp gravy
great green greet grill grove guard guess guest guild habit happy
hardy hatch haven hazel heard heavy hedge hello hence heron hobby holly honor
hound house hover human humor hurry ideal image index inner input irony
issue ivory jelly jolly kayak knack known label lance large
laser latch later laugh layer learn lease least leave ledge lemon lever
light lilac linen liner lodge lofty logic lotus lower lucky lunar
lunch lyric major maker manor maple march marsh match maybe mayor meant medal
media mercy merit metal meter might mimic minus model money month moral
motor motto mouse muddy mural music naval never newly noble noise
north noted novel oasis ocean offer often olive onion onset opera orbit order
other ought ounce outer oxide ozone paint panel paper parka pasta
paste patch pause peace pedal penny perch petal phase piano
piece pilot pitch pixel pizza place plain plane plank plant plate plaza pleat pluck
plume point polar porch pouch price prime print prism prize proof
prose proud prune purse quart query quest queue quick quilt quota
quote radar radio rainy raise rally ranch range rapid ratio raven reach react ready
realm refer relay renew reply resin ridge right rinse ripen risen river
roast robin robot rocky rodeo roomy roost round route rover royal ruler rural
salad salon sandy sauce scale scene scoop scope scrap
scrub sedan sense serve setup seven shade shall shape shark sharp shawl sheet
shelf shell shift shine shiny shore short shown shrub silly since
siren sixth sixty skate skill slate sleek slice slide slope smart smile
snack snail solar solid solve sonic sorry south space spare speak spell
spend spent spoke sport squad stack staff stain stair stake
stamp stand start state steel steep steer still stock stone stood stool
storm story stove straw stray stuck study stuff suite sunny super
surge swamp swift syrup table taken teach tempo tenth theme there
thing think third thorn those three threw timer title toast today
token tonic topic torch total tough tower trace track trade trail trait trash
tread treat trend trial tribe tried trout truck truly trunk truth tulip
tuner tweed twice twist ultra under unify union unite unity until upper urban usage
usual valid value valve vapor vault verse vigor viola visit vista vital
vivid vocal wagon water weary weave wedge wheat wheel where which while
whirl white whole whose widen width windy witty world worry worth would woven write
yacht yield zebra
abroad accent accept across action active actual adjust advice aerial
afford agenda almost always amount anchor annual answer anyway appear
arcade arctic artist aspect assume atomic attend august author autumn avenue
backup badger ballad ballet bamboo banner barley barrel basket beacon beaker
beauty become beetle before belong beside better beyond bitter
bleach boiler bonnet border borrow bottle bounce branch breeze bridge bright broken
bronze bubble bucket budget buffet bundle bureau butter button cactus
canopy canvas canyon carbon career carpet castle cattle
cellar cement census center cereal chance change cheese chorus
chosen cinema circle circus citrus clever clinic clover cobalt coffee
colony column comedy common cookie copper corner cotton county course
create credit crisis critic cuckoo cursor custom damage dealer debate
decade decent decide defend define degree delete demand dental depend deploy desert
design detail detect device dinner divide dollar domain double dragon
drawer driven driver during easily editor effect effort eighth either
empire employ enable engine enough ensure entire entity equity escape estate
exceed expand expect expert export extend fabric facade factor fairly fallen
famous farmer fasten faucet figure filter fiscal flight flower fluffy
folder forest forget formal format fossil fourth freely freeze frozen
fruity future galaxy gallon garage garden garlic gather gazebo ginger
global govern gravel ground guitar handle harbor hardly
heater height hermit hollow honest hurdle ignore impact
import income indoor inform inland insect insist intake intend invent invest
island itself jacket jersey jigsaw jungle kettle kindly ladder
lagoon laptop lately latter launch lawyer layout league legacy legend lender
letter likely linear listen litter lively lizard locker
lounge mainly manner marble margin marina market mascot matter meadow medium
mellow memory mental mentor merely method middle mighty minute mobile
modern modest moment mortar mostly motion motive murmur museum mutual
narrow nation native nature nearby nearly nickel normal notice notion
number nutmeg object obtain office online oppose option orange origin outfit output
oxygen palace pantry parade parcel parrot pastel pastry patent patrol
pebble pencil people pepper period permit phrase picnic pillar planet plenty pocket
poetry policy polish pollen poster potato prefer pretty profit
prompt proper puddle puffin purple puzzle racing radish random
rarely rather reader really reason recall recent recipe reduce reform
refuse region remain remedy remote remove render repair repeat rescue
resort result retail retain retire return reveal review ribbon riddle
ripple rising robust rocket runway safari salmon sample saucer
scheme scroll season second sector seldom select seller senior sensor
series settle severe shadow shield silent silver simple singer sketch skiing
sleeve slight slogan smooth snappy soccer social socket sodium soften solely source
speech sphere spiral splash sponge spring sprout square squash stable stance staple
starch static statue status steady stereo strand stream street stride string strong
studio subtle suburb sudden summer summit sunset supply surely survey
symbol system tablet tailor talent target teapot temple tennis thanks theory thirty
thread thrive ticket timber tissue toffee tomato toward travel treaty trophy
tunnel turkey turtle twenty typing unique unless update upward useful
valley vanity vector vendor verbal versus vessel violin virtue vision
visual volume voyage waffle walker wallet walnut wander warmth wealth weekly weight
winter wisdom wizard wonder writer yellow zipper
ability account achieve acquire address advance advisor airline airport
already amazing ancient another antique applied arrange arrival
artwork attempt auction average awkward balance balcony balloon banking
bargain barrier battery bearing because beneath benefit between bicycle biology
biscuit blanket blossom bracket briefly buffalo builder cabinet calcium
caramel careful carrier cascade catalog caution ceiling central century
ceramic certain chamber channel charity chimney circuit citizen
classic climate closing clothes cluster coastal collect combine comfort
comment company compass complex concert conduct confirm connect consist
contact content context convert cooking correct cottage council
counter country courier culture current cushion
cycling daytime declare decline default deliver density deposit desktop dessert
diamond digital dignity discuss distant diverse dolphin doorway
drawing driving dynamic eastern economy edition educate element elevate embassy
emerald enhance episode equator erosion exactly example
expense explain explore express factory faculty fashion feature federal
fiction finance fishing fitness flannel flatten flutter foliage footage
forever formula fortune forward founder fragile freedom freight furnace gallery
garbage gateway general genuine glacier granite graphic gravity grocery
habitat haircut halfway harmony harvest heading hearing heating helpful
highway history holiday horizon housing however hundred immense improve
include initial inquiry install instant instead interim invoice isolate
jasmine journal journey justice kingdom kitchen knowing lantern largely laundry
leaflet lecture leisure lettuce liberty library license literal
luggage machine magenta mailbox manager mandate mansion meaning
measure meeting mention message million mineral minimal minimum miracle
mission mixture monitor monthly musical natural nearest neither
network neutral nothing nowhere nucleus numeral oatmeal obvious octopus
opinion optical orchard organic origami outcome outdoor outline outside overall
painter parking passage passive patient pattern payment peanuts pelican
penguin pension perfect perhaps pianist picture pilgrim pioneer plastic
plateau platter popcorn popular portion postage pottery poultry
predict premier prepare preview primary printer problem proceed process
produce product profile program project promise protein provide publish pumpkin
purpose pyramid quality quantum quarter railway rainbow rapidly reading reality
receipt receive recover regular related remains removal replace request
require reserve resolve respect respond restore revenue rolling routine
royalty sailing salvage sandbox scanner scatter scenery science seaside
section segment seminar serious session setting seventh several shelter
shortly silence similar sincere skilled society sparrow speaker
special species spinach sponsor squeeze stadium starter station storage strange
subject success suggest summary support supreme surface surplus survive
terrace texture theater thermal thinker thirsty thought through
thunder tighten topical tornado totally tourism tourist towards
traffic trailer transit trellis tribune trumpet trustee turbine
typical unknown unusual upgrade upright utility vacancy variety various
vehicle venture version veteran village vintage virtual visible visitor vitamin
volcano voltage walking washing weather webpage weekday weekend welcome
welfare western whereas whistle willing without wording working writing
written
absolute abundant accurate activity actually addition adequate adjacent
advanced advocate aircraft alphabet although aluminum ambition analysis ancestor
announce annually anything anywhere apparent approach approval argument artistic
assembly attitude aviation backpack backyard balanced baseball birthday
blizzard bookcase bookmark bracelet brochure building bulletin business
calendar campaign cardinal carriage category cautious ceremony champion chemical
chipmunk chloride circular classify clearing climbing clinical clothing coherent
colonial colorful commerce complete composer compound computer conclude concrete
congress consider constant consumer continue contract contrast convince cookbook
corridor coverage creative credible critical crossing cultural currency
database daylight deadline decision decorate definite delicate delivery describe
designer detailed dialogue diameter directly director discount discover distance
distinct district dividend document domestic doorbell download downtown dramatic
driveway dumpling duration dwelling earnings economic educated election electric
elephant elevator eligible emerging emphasis employee endeavor engaging engineer
envelope equality equation estimate evaluate evidence exchange
existing expected extended exterior external facility farewell favorite
feedback festival finished flagship flexible floating flooring flourish
folklore football forecast forestry formally fortress fountain fraction fragment
freezing frequent frontier fruitful function gardener gasoline generate generous
genetics geometry gigantic goldfish goodness graphics grateful
habitual handbook handling handmade happened hardware harmless heritage highland
historic homemade hydrogen identify identity ignition illusion
imperial increase indicate indirect industry informal integral intended interior
internal interval investor inviting isolated kangaroo keyboard kindness
landmark laughter lavender learning leverage lifetime lighting likewise
listener literary location magnetic maintain majority mandarin marathon marginal
material meantime measured mechanic membrane memorial merchant minister
minority mobility modeling moderate molecule momentum monopoly monument mortgage
mountain movement multiple national navigate neighbor normally
notebook novelist numerous nutrient obstacle occasion offering official operator
opposite optimism ordinary organize original outreach overcome overlook painting
pamphlet parallel particle passport password patience peaceful peculiar
pedestal perceive periodic personal physical planning platform plumbing
politics portrait positive possible postcard potatoes powerful
premiere presence preserve prestige previous printing priority probable producer
progress promptly proposal prospect protocol provider province
purchase quantity question railroad rational reaction readable receiver recently
recovery redesign referral regional register relative relevant reliable
remember reminder renowned repeated reporter republic research resident resolved
resource response revision rotation sandwich scenario schedule seasonal sediment
selected sentence separate sequence settlers shepherd shipment
sidewalk simplify situated slightly snowfall software solution
somewhat souvenir spacious speaking specific spelling spending spinning splendid
sporting squirrel stairway standard starfish steadily sterling straight strategy
strength suburban suddenly suitable sunlight sunshine superior supplier
supposed surprise surround swimming symbolic tangible taxpayer teaching telegram
template tendency terminal textbook thankful thinking thorough
thousand timeline together tomorrow tortoise township tracking training transfer
transmit traveler treasure trillion tropical tutorial ultimate umbrella uncommon
underway uniquely universe unlikely upcoming updating vacation validity valuable
variable vertical villager vineyard visiting vocalist wardrobe warranty
waterway wildlife windmill wireless woodland workshop yearbook
accessory accompany according adventure advertise aerospace afternoon agreement
allowance alternate ambitious amusement announced apartment apparatus appealing
appliance assistant associate automatic available backwards
badminton balancing ballpoint bandwidth barometer beautiful beginning benchmark
beverages bicycling biography blueberry boardroom bookstore boulevard breakfast
brilliant broadcast buildings butterfly calculate cardboard carefully carpenter
cartridge catalogue celebrate certainly challenge chamomile character chemistry
chocolate circulate clockwork clubhouse coastline cognitive collector
committee community completed component computing condition
conscious consensus construct container continent continued cooperate
copyright corporate countless courtyard craftsman crossroad crossword cultivate
currently customary dandelion dedicated democracy departure dependent
detective determine developed dictation different difficult dimension direction
directory discovery diversity documents dragonfly dutifully eagerness earthworm
easygoing economics education effective elaborate electrons elegantly elsewhere
embroider emergency emphasize encourage endurance engineers enjoyable entertain
establish evolution excellent excursion executive exemplary
existence expansion expensive expertise explained expressed extension extensive
fabricate farmhouse favorable fireplace fisherman flowering following
formation fortunate framework frequency freshness furniture gardening generally
geography gradually gratitude greatness guarantee guidebook guitarist hamburger
harmonica haystacks headlines hierarchy highlight historian hopefully household
hurricane hydraulic immediate important improving inclusion incorrect increased
influence initially inspiring installed insurance interview introduce invention
inventory investing involving irregular isolation itinerary jellyfish knowledge
landscape librarian lifestyle lightning limestone listening livestock
locations machinery magazines magnitude marmalade mechanism medallion mentioned
merchants microwave migration milestone miniature moderator molecules
monitored monologue motivated mountains multitude narrative naturally navigator
necessary negotiate neighbors newspaper nonprofit northeast northwest nutrition
objective obviously occasions operation orchestra organized otherwise outskirts
paperback paragraph parchment peninsula perennial permanent petroleum
placement political porcelain portfolio posterity postponed practical
precisely predicted preferred presented president prevented primarily principal
principle procedure processor producing promising pronounce protected
provision publicity published quarterly questions raspberry readiness realistic
recognize rectangle reference reflected regarding registrar rehearsal
reinforce relevance residence resilient reviewing revolving riverbank riverside
sandstone satellite saxophone scarecrow scientist screening sculpture seashells
shoreline signature similarly situation slideshow snowflake
solitaire somewhere spaghetti stability staircase
statement steamship storeroom strategic streamers streetcar structure subscribe
substance succeeded suggested sunflower sunscreen supporter symphony syndicate
synthesis talkative technical technique telephone temperate temporary
territory testimony textbooks therefore timetable tolerance toothpick transform
translate transport traveller treadmill treasures treatment truckload typically
umbrellas underline unfolding uniformly universal utilities vacations valuables
vegetable versatile victories vineyards volunteer wallpaper warehouse
waterfall watermark wellbeing whichever wholesale wonderful workforce workplace
yesterday zoologist
absolutely accountant accurately activities additional adjustment ambassador
apartments assessment assignment atmosphere background basketball
blackboard bookkeeper brightness calculated cantaloupe capability
categories celebrated centimeter checkpoint chessboard chronicles
clockmaker collection commercial commission comparison completion complexity
components compromise concerning conclusion connection consistent
constantly consultant continuous contractor convenient correspond curriculum
dependable designated determined developing dictionary difference difficulty
directions discovered dishwasher distillery distribute documented downstream
efficiency electrical elementary employment encouraged engagement enterprise
equivalent especially essentials eventually experiment expression
fertilizer fieldstone flashlight footbridge foundation frequently functional
generation government grandstand greenhouse guidelines gymnastics
helicopter highlights historical homecoming horizontal
houseplant illustrate importance impression incredible individual industrial
ingredient initiative inspection instrument integrated interested investment
invitation irrigation journalism laboratory landscaper lighthouse likelihood
literature livelihood locomotive lumberjack management manuscript
meaningful measurable mechanical memorandum metropolis microphone
monumental motivation navigation negotiator newsletter
nineteenth noticeable nutritious objectives occasional occupation officially
operations optimistic originally paintbrush paragraphs particular passengers
pedestrian percentage perfection permission personally persuasive
plantation politician popularity population postmaster
powerhouse prediction preference presenting principles procedures processing
production profession proportion prosperity psychology publishing
qualifying rainforest recreation reflection regulation remarkable
repetition reputation resolution restaurant retirement sandcastle scientific
screenplay sculptural semicircle separately settlement silhouette
simplicity skateboard spacecraft speciality spectacles statistics
stepladder storefront strawberry streamline strengthen structural submission
subsequent substitute successful sufficient suggestion summertime sunglasses
supervisor tablecloth technology television terracotta throughout
timekeeper tournament transition travelling tremendous typewriter understand
vegetables vocabulary volleyball watercolor waterproof wheelchair
windowsill woodcutter worthwhile
accompanied achievement advertising agriculture anniversary application
approximate arrangement association assumptions atmospheric
bookkeeping butterflies calculation certificate chronograph
circulation classically coincidence collections comfortable
communicate compartment competition complicated composition comprehends
computation concentrate conditional conferences connections consequence
consistency constructed consultants consumption contributor convenience
cooperation coordinated corresponded countryside credentials declaration
demonstrate description destination development differently discoveries
distinguish distributor documentary electricity engineering enhancement
environment established examination expectation expenditure experienced
explanation fingerprint frequencies furnishings gingerbread
handcrafted handwriting hummingbird hydroplanes illustrated
immediately improvement independent information inspiration
institution instruction intelligent interesting interpreted investigate
landscaping legislation lightweight maintenance mathematics
measurement merchandise microscopes mockingbird mountaineer negotiation
neighboring observation opportunity outstanding participant
playwrights preparation preservation probability
programming proposition publication quarterback reclamation recognition
refrigerate registrator reliability replacement residential restoration
scientists sightseeing significant snowboarding
sophisticated specialists spectacular stewardship storyteller streetlight
subscription substantial supervision surrounding sustainable temperature
thermometer thunderstorm traditional translation transparent typewriters
underground understated unfortunate usefulness valedictory watermelons
wheelbarrow wildflowers
architecture breakthrough calculations celebrations championship compositions
construction contemporary contribution conversation demonstrated descriptions
developments distribution encyclopedia entrepreneur experimental explanations
fundamentals geographical headquarters housekeeping hypothetical
illustration improvements independence installation instructions instrumental
intermediate intersection laboratories manufacturer mathematical measurements
metropolitan neighborhood observations occasionally organization particularly
preparations presentation publications recreational refrigerator
requirements respectively significance spokesperson strawberries
successfully surroundings technologies thermometers translations transmission
weatherproof
accessibility administrator approximately architectural championships
communication consideration determination documentation entertainment
environmental establishment international investigation manufacturing
neighborhoods opportunities participation possibilities
presentations questionnaire refrigerators understanding
administration correspondence identification implementation infrastructure
interpretation investigations organizational representative responsibility
superintendent transportation
`;

/** Every decoy, for membership tests. */
export const DECOY_WORDS: ReadonlySet<string> = new Set(
  DECOY_TEXT.split(/\s+/).filter((w) => /^[a-z]{2,}$/.test(w))
);

/** The decoys by length. */
const DECOYS_BY_LENGTH: ReadonlyMap<number, readonly string[]> = (() => {
  const by = new Map<number, string[]>();
  for (const word of DECOY_WORDS) {
    const list = by.get(word.length) ?? [];
    list.push(word);
    by.set(word.length, list);
  }
  return by;
})();

/** The width classes as rough advances in ems, to keep a decoy near its word's width. */
const advanceOf = (ch: string): number => {
  if (LOWER_NARROW.includes(ch) || UPPER_NARROW.includes(ch)) return 0.3;
  if (LOWER_WIDE.includes(ch) || UPPER_WIDE.includes(ch)) return 0.85;
  return ch === ch.toUpperCase() ? 0.68 : 0.56;
};
const widthOf = (word: string): number => [...word].reduce((w, ch) => w + advanceOf(ch), 0);

/** Tries per word before a decoy gives way to the letter scramble. */
const DECOY_TRIES = 16;

/**
 * A decoy for one word of ASCII letters: listed, the same length, no letter where the
 * word has the same one, and the closest in width of the candidates tried; the
 * word's capitals are carried over. Null when none fits.
 */
const decoyFor = (word: string, next: () => number): string | null => {
  const pool = DECOYS_BY_LENGTH.get(word.length);
  if (!pool) return null;
  const lower = word.toLowerCase();
  const target = widthOf(word);
  let best: string | null = null;
  let bestGap = Infinity;
  for (let tries = 0; tries < DECOY_TRIES; tries++) {
    const candidate = pool[Math.floor(next() * pool.length)]!;
    let clash = false;
    for (let i = 0; i < candidate.length && !clash; i++) {
      clash = candidate.charAt(i) === lower.charAt(i);
    }
    if (clash) continue;
    const cased = [...candidate]
      .map((ch, i) => (word.charAt(i) !== lower.charAt(i) ? ch.toUpperCase() : ch))
      .join("");
    const gap = Math.abs(widthOf(cased) - target);
    if (gap < bestGap) {
      best = cased;
      bestGap = gap;
    }
  }
  return best;
};

/** FNV-1a — a stable 32-bit seed from the string. */
const seedFrom = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** mulberry32 — small, fast and good enough for texture. */
const prng = (seed: number) => {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** One character swapped for another of its class, never itself. */
const scrambleChar = (ch: string, pool: string, next: () => number): string => {
  // Never hand back the original letter: a scramble that leaves some letters in
  // place leaks short words through.
  let pick = ch;
  for (let tries = 0; pick === ch && tries < 4; tries++) {
    pick = pool.charAt(Math.floor(next() * pool.length));
  }
  return pick === ch ? pool.charAt((pool.indexOf(ch) + 1) % pool.length) : pick;
};

export function scrambleLockedText(text: string): string {
  const next = prng(seedFrom(text));
  // Words (runs of ASCII letters) become decoys; everything else goes character by
  // character — digits scrambled, the rest untouched.
  return text.replace(/[A-Za-z]+|[^A-Za-z]/g, (token) => {
    if (/^[A-Za-z]/.test(token)) {
      const decoy = decoyFor(token, next);
      if (decoy) return decoy;
      return [...token].map((ch) => scrambleChar(ch, classFor(ch)!, next)).join("");
    }
    const pool = classFor(token);
    return pool ? scrambleChar(token, pool, next) : token;
  });
}
