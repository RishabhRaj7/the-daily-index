// Keyed by the exact circuitName string returned by the Jolpica/Ergast API.
// 2-3 facts per circuit — StartingGrid picks one at random on mount.
export const CIRCUIT_FACTS: Record<string, string[]> = {
  "Albert Park Circuit": [
    "The circuit is built on public roads around a lake — those same roads are open to Melbourne commuters 51 weeks a year.",
    "The lake at the centre is 5 km in circumference, so drivers travel roughly one lakeside loop per racing lap.",
    "Australia hosted the season opener every year from 1996 to 2022, making it the unofficial start of the F1 calendar for a generation of fans.",
  ],
  "Bahrain International Circuit": [
    "Bahrain was the first Middle Eastern country to host a Formula 1 Grand Prix, in 2004.",
    "The circuit sits in the desert and regularly battles with sandstorms during practice — wind direction can shift grip levels lap-by-lap.",
    "The outer layout of the circuit, used for the 2020 Sakhir GP, is one of the shortest laps in F1 history at just 3.5 km.",
  ],
  "Jeddah Corniche Circuit": [
    "At 6.175 km Jeddah is the second-longest circuit on the calendar, yet its average speed rivals Monza due to 27 corners taken flat-out.",
    "The street circuit runs directly alongside the Red Sea — you can see open water from cockpit camera footage.",
    "Visibility is so limited in the high-speed section that drivers rely almost entirely on memory; there are only three DRS zones to carry momentum.",
  ],
  "Suzuka Circuit": [
    "Suzuka is one of only two figure-of-eight circuits in Formula 1 history — the overpass connecting the two loops is an engineering landmark.",
    "Ayrton Senna clinched three of his world championships at Suzuka, cementing it as one of the sport's most emotional venues.",
    "The 130R corner was once flat-out in a road car; in an F1 car drivers take it at over 300 km/h.",
  ],
  "Shanghai International Circuit": [
    "The circuit's layout was inspired by the Chinese character 上 (shàng), meaning 'above' or 'ascend'.",
    "Turn 1 at Shanghai is one of the longest corners in F1 — drivers hold full throttle for nearly four seconds through the sweeping entry.",
    "The pit lane at Shanghai is unusually long, adding around 20 seconds per stop compared to tighter venues.",
  ],
  "Miami International Autodrome": [
    "The circuit wraps around the Hard Rock Stadium — fans in upper stands can watch cars race between the grandstands.",
    "There is no natural water feature; the 'marina' visible in television shots is an artificial lake installed purely for aesthetics.",
    "Miami is one of the newest circuits on the calendar, debuting in 2022, yet already produces some of the season's longest DRS trains.",
  ],
  "Autodromo Enzo e Dino Ferrari": [
    "Imola is named after both Enzo Ferrari and his son Dino, who died of muscular dystrophy aged 24.",
    "The track runs anti-clockwise, one of only a handful on the F1 calendar — teams reconfigure their car setups significantly for this alone.",
    "Imola hosted the darkest weekend in modern F1: Roland Ratzenberger and Ayrton Senna both lost their lives here in 1994.",
  ],
  "Circuit de Monaco": [
    "The Monaco circuit is so tight that a double-decker bus would fail to navigate Turn 1.",
    "The average speed of a Monaco lap is around 155 km/h — slower than most F1 circuits use as a top-speed reference.",
    "Overtaking is so rare at Monaco that the starting grid position is considered the single biggest predictor of the race result.",
  ],
  "Circuit de Barcelona-Catalunya": [
    "Barcelona's long Turn 3 complex is one of the most demanding sequences for tyre wear on the calendar — left-rear degradation is critical.",
    "The circuit is used by almost every F1 team as their primary pre-season test venue, meaning drivers arrive knowing it intimately.",
    "The fan stand at the exit of Turn 9 (the Campsa hairpin) is one of the few places spectators can watch cars at maximum lateral G.",
  ],
  "Circuit Gilles Villeneuve": [
    "The circuit is named after Gilles Villeneuve, the beloved Ferrari driver who died in qualifying at Zolder in 1982.",
    "The 'Wall of Champions' at the chicane before the pits has claimed world champions Jacques Villeneuve, Michael Schumacher, and Damon Hill in a single weekend.",
    "Île Notre-Dame is a man-made island built with rubble excavated during the construction of the Montreal Metro.",
  ],
  "Red Bull Ring": [
    "The Red Bull Ring sits at 660 m above sea level — the altitude reduces engine power and changes aerodynamic balance noticeably.",
    "The circuit was originally built in 1969 as the Österreichring; it was completely redesigned and shortened in the 1990s.",
    "Turn 3 at the Red Bull Ring is the steepest uphill corner in Formula 1, climbing 32 metres in a single sweeping arc.",
  ],
  "Silverstone Circuit": [
    "Silverstone hosted the very first Formula 1 World Championship race on 13 May 1950 — making it the spiritual home of the sport.",
    "The circuit is built on a former RAF airfield; the runways still form the basis of the straight sections you see today.",
    "Copse corner, now taken flat-out at over 280 km/h, was considered undriveable without lifting when the circuit opened.",
  ],
  "Hungaroring": [
    "The Hungaroring was built in just eight months in 1986 to bring Formula 1 behind the Iron Curtain for the first time.",
    "Over 200,000 people attended the inaugural 1986 Hungarian Grand Prix — extraordinary for a communist country at the time.",
    "Low-downforce setups provide almost no benefit here; the Hungaroring rewards maximum aero grip due to its relentless sequence of medium-speed corners.",
  ],
  "Circuit de Spa-Francorchamps": [
    "Eau Rouge / Raidillon rises 40 metres in elevation through a near-blind uphill left-right sequence — one of the most iconic corners in motorsport.",
    "The weather at Spa is infamously local: it can be dry at La Source and raining at Pouhon, just 2 km away, simultaneously.",
    "Spa-Francorchamps is the longest circuit on the F1 calendar at 7.004 km — nearly two kilometres longer than the second-longest.",
  ],
  "Circuit Zandvoort": [
    "The banked final corner — Arie Luyendyk bocht — has a banking angle of 18 degrees, the steepest of any F1 circuit in use today.",
    "Zandvoort sits in the North Sea coastal dunes; wind off the sea can shift grip conditions completely between practice and race day.",
    "The circuit returned to the F1 calendar in 2021 after a 36-year absence, driven partly by Max Verstappen's popularity in the Netherlands.",
  ],
  "Autodromo Nazionale di Monza": [
    "Monza is the fastest circuit on the calendar — average race speeds exceed 265 km/h, and top speeds approach 370 km/h on the main straight.",
    "The original circuit included a steeply banked oval section; that banking still exists and is visible from the modern layout, slowly being reclaimed by trees.",
    "Teams run the lowest downforce configurations of the season here — cars resemble flat-decked sleds compared to their Monaco specification.",
  ],
  "Baku City Circuit": [
    "Baku's castle section — a narrow alley through the walled Old City — is the tightest corner sequence in Formula 1 at just 7.6 m wide.",
    "The main straight at Baku (2.2 km) is the longest in Formula 1, allowing drivers to reach over 360 km/h before the Turn 1 braking zone.",
    "The circuit runs past UNESCO World Heritage sites, including the Palace of the Shirvanshahs, dating to the 15th century.",
  ],
  "Marina Bay Street Circuit": [
    "Singapore is the only Formula 1 night race on the calendar — the track is lit by over 1,500 lux of floodlighting, brighter than most football stadiums.",
    "The circuit crosses three bridges over the Marina Bay, including one that opens for shipping traffic and must be closed for race weekend.",
    "Heat and humidity at Singapore are so punishing that the physical demands on drivers are equivalent to losing up to 4 kg of water weight per race.",
  ],
  "Circuit of the Americas": [
    "COTA was designed with deliberate references to other great circuits: Turn 1 mimics Eau Rouge, the stadium section echoes Hockenheim's old arena.",
    "The elevation change at COTA is 40 metres from the lowest to highest point — the blind crest at Turn 1 is one of the most dramatic entries in the sport.",
    "The circuit hosted the US Grand Prix from 2012; Austin is now one of the most attended F1 races in the world, drawing over 400,000 across the weekend.",
  ],
  "Autodromo Hermanos Rodriguez": [
    "Mexico City sits at 2,240 m above sea level — the highest circuit on the F1 calendar — reducing atmospheric pressure and engine power significantly.",
    "Teams run maximum downforce despite the altitude to compensate for the thinner air; the car still generates 25–30% less aerodynamic load than at sea level.",
    "The Foro Sol baseball stadium, which the circuit passes through, can hold 55,000 fans — one of the most electric spectating experiences in F1.",
  ],
  "Autodromo Jose Carlos Pace": [
    "The circuit is named after Carlos Pace, the Brazilian driver who won his home race in 1975 — the only victory of his career — and died in a plane crash in 1977.",
    "Interlagos is an anti-clockwise circuit, meaning lateral loads are predominantly on the right-hand side — drivers build asymmetric neck strength for this race.",
    "The weather in São Paulo is notoriously unpredictable; the 2016 Brazilian Grand Prix saw drivers navigating a river of water flowing across the track in heavy rain.",
  ],
  "Las Vegas Strip Street Circuit": [
    "The Las Vegas GP circuit runs directly down a section of the famous Strip, passing hotels including the Bellagio and Caesars Palace.",
    "Despite a disastrous first-corner incident in 2023's inaugural race, the Las Vegas GP is one of the most commercially lucrative events on the calendar.",
    "The circuit's long straights make it one of the highest top-speed venues of the season, with cars exceeding 340 km/h on Las Vegas Boulevard.",
  ],
  "Losail International Circuit": [
    "Losail was originally a motorcycle circuit — it hosted MotoGP before Formula 1 arrived, and its layout reflects two-wheel racing priorities.",
    "The circuit sits in the Qatar desert; when racing at night, fine sand particles carried by desert winds abrade tyres faster than almost any other venue.",
    "Qatar's sprint weekend format in 2023 meant drivers completed race-distance laps three times in one weekend — an extraordinary physical and strategic challenge.",
  ],
  "Yas Marina Circuit": [
    "Yas Marina was purpose-built in 2009 and passes through the Ferrari World theme park, which sits directly astride the circuit's main straight.",
    "The circuit has been reconfigured twice — most significantly in 2021, when corners were opened up to improve overtaking opportunities.",
    "Abu Dhabi hosts the season finale every year; since 2010 it has decided the world championship five times under the floodlights of Yas Marina.",
  ],
};
