// Mega-menu content captured from https://www.garmin.com/en-US/ (2026-11-17).
// Labels are message keys (messages/*.json, `Header` namespace) resolved with `t()` where rendered.
// M4.4: every category/subcategory with a taxonomy node (src/server/catalog/taxonomy-seed.ts) links to its local
// /c/<slug> page; a top-level menu item opens its root node. The holiday sale promo and takeover bar open the
// local Sale page (/c/promotions). Only the links in EXTERNAL_NAV_LINKS stay on garmin.com (see the reasons
// there); tests/unit/nav-links.test.mjs enforces both rules.

export interface MegaLink {
  labelKey: string;
  href: string;
}

export interface MegaGroup {
  /** Absent for a continuation group (the live site renders an empty heading). */
  headingKey?: string;
  links: MegaLink[];
}

export interface MegaPromo {
  titleKey: string;
  copyKey: string;
  href: string;
  image: string;
}

export interface MegaNavItem {
  labelKey: string;
  href: string;
  /** Root category this top item stands for (owner 2026-11-22: the menu is built from Admin ▸ Categories). */
  categoryKey: string;
  /** Up to three link columns, each holding one or more groups. */
  columns?: MegaGroup[][];
  promos?: MegaPromo[];
}

/**
 * The menu as the header renders it: every label already in the visitor's language. The server builds it from
 * Admin ▸ Categories (src/server/catalog/mega-nav.ts); `resolveMegaNav` turns the built-in `megaNav` into the same
 * shape when there are no categories yet (owner 2026-11-22).
 */
export interface NavLink { label: string; href: string }
export interface NavGroup { heading?: string; links: NavLink[] }
export interface NavPromo { title: string; copy: string; href: string; image: string }
export interface NavItem { label: string; href: string; columns?: NavGroup[][]; promos?: NavPromo[] }

export const resolveNavGroup = (group: MegaGroup, t: (key: string) => string): NavGroup =>
  ({ ...(group.headingKey ? { heading: t(group.headingKey) } : {}), links: group.links.map(link => ({ label: t(link.labelKey), href: link.href })) });
export const resolveNavPromo = (promo: MegaPromo, t: (key: string) => string): NavPromo =>
  ({ title: t(promo.titleKey), copy: t(promo.copyKey), href: promo.href, image: promo.image });

/** The built-in menu with its message keys translated. */
export function resolveMegaNav(items: readonly MegaNavItem[], t: (key: string) => string): NavItem[] {
  return items.map(item => ({
    label: t(item.labelKey), href: item.href,
    ...(item.columns ? { columns: item.columns.map(column => column.map(group => resolveNavGroup(group, t))) } : {}),
    ...(item.promos ? { promos: item.promos.map(promo => resolveNavPromo(promo, t)) } : {}),
  }));
}

const G = "https://www.garmin.com/en-US";

const holidayPromo: MegaPromo = {
  titleKey: "Header.promos.holidaySale.title",
  copyKey: "Header.promos.holidaySale.copy",
  href: "/c/promotions",
  image: "/homepage/nav/HOLIDAY-SALE-TOP-NAV.jpg",
};

const fenixPromo: MegaPromo = {
  titleKey: "Header.promos.fenix9.title",
  copyKey: "Header.promos.fenix9.copy",
  href: "/minisite/fenix-8",
  image: "/homepage/nav/87582-TN-NEW.jpg",
};

export const megaNav: MegaNavItem[] = [
  {
    labelKey: "Header.nav.smartwatches",
    categoryKey: "wearables-smartwatches",
    href: "/c/wearables-smartwatches",
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.allSmartwatches", href: "/c/wearables-smartwatches" },
            { labelKey: "Header.links.healthFitnessTracking", href: "/c/sports-fitness/activity-fitness-trackers" },
            { labelKey: "Header.links.designYourOwnWatch", href: "/c/wearables-smartwatches/design-your-own-watch" },
            { labelKey: "Header.links.watchesForWomen", href: "/c/women-wearables" },
            { labelKey: "Header.links.fashionHybridSmartwatches", href: "/c/sports-fitness/fashion-hybrid-smartwatches" },
            { labelKey: "Header.links.marqLuxuryWatchCollection", href: "/minisite/marq" },
            { labelKey: "Header.links.running", href: "/c/sports-fitness/running-smartwatches" },
            { labelKey: "Header.links.multisportTriathlete", href: "/c/sports-fitness/multisport-smartwatches" },
            { labelKey: "Header.links.adventure", href: "/c/outdoor-recreation/adventure-smartwatches" },
            { labelKey: "Header.links.swimming", href: "/c/sports-fitness/swimming-smartwatches" },
            { labelKey: "Header.links.diving", href: "/c/sports-fitness/dive-computers-smartwatches" },
            { labelKey: "Header.links.golf", href: "/c/sports-fitness/golf-gps-devices-smartwatches" },
            { labelKey: "Header.links.kidsSmartwatches", href: "/c/sports-fitness/kids-wearables-fitness-activity-trackers" },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.maps",
          links: [
            { labelKey: "Header.links.outdoorMaps", href: "/c/wearables-mapping" },
            { labelKey: "Header.links.golfCourseLocator", href: `${G}/golf-courses/` },
          ],
        },
        {
          headingKey: "Header.groups.accessoriesPlans",
          links: [
            { labelKey: "Header.links.accessories", href: "/c/wearables-smartwatches-accessories" },
            { labelKey: "Header.links.apps", href: "/c/apps" },
            { labelKey: "Header.links.servicePlans", href: "/c/subscription-plans" },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.discover",
          links: [
            { labelKey: "Header.links.garminPay", href: "/minisite/garmin-pay" },
            { labelKey: "Header.links.garminTechnology", href: `${G}/garmin-technology/` },
            { labelKey: "Header.links.watchFinder", href: `${G}/which-watch/` },
          ],
        },
      ],
    ],
    promos: [holidayPromo, fenixPromo],
  },
  {
    labelKey: "Header.nav.sportsFitness",
    categoryKey: "sports-fitness",
    href: "/c/sports-fitness/running-smartwatches",
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.running", href: "/c/sports-fitness/running-smartwatches" },
            { labelKey: "Header.links.healthFitnessTracking", href: "/c/sports-fitness/activity-fitness-trackers" },
            { labelKey: "Header.links.cirqaSmartBand", href: "/c/sports-fitness/cirqa-smart-band" },
            { labelKey: "Header.links.cycling", href: "/c/sports-fitness/cycling-bike-computers-bike-radar-power-meter-headlights" },
            { labelKey: "Header.links.tacxIndoorCycling", href: "/c/sports-fitness/indoor-trainers" },
            { labelKey: "Header.links.designYourOwnWatch", href: "/c/wearables-smartwatches/design-your-own-watch" },
            { labelKey: "Header.links.golf", href: "/c/sports-fitness/golf-gps-devices-smartwatches" },
            { labelKey: "Header.links.multisportTriathlete", href: "/c/sports-fitness/multisport-smartwatches" },
            { labelKey: "Header.links.swimming", href: "/c/sports-fitness/swimming-smartwatches" },
            { labelKey: "Header.links.diving", href: "/c/sports-fitness/dive-computers-smartwatches" },
            { labelKey: "Header.links.scalesMonitors", href: "/c/sports-fitness/scales-monitors" },
            { labelKey: "Header.links.kidsSmartwatches", href: "/c/sports-fitness/kids-wearables-fitness-activity-trackers" },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.maps",
          links: [
            { labelKey: "Header.links.cyclingMaps", href: `${G}/p/730831` },
            { labelKey: "Header.links.outdoorMaps", href: "/c/wearables-mapping" },
            { labelKey: "Header.links.golfCourseLocator", href: `${G}/golf-courses/` },
          ],
        },
        {
          headingKey: "Header.groups.accessoriesPlans",
          links: [
            { labelKey: "Header.links.smartwatchAccessories", href: "/c/wearables-smartwatches-accessories" },
            { labelKey: "Header.links.cyclingAccessories", href: "/c/sports-fitness/cycling-biking-accessories" },
            { labelKey: "Header.links.indoorTrainingAccessories", href: "/c/sports-fitness/indoor-training/accessories" },
            { labelKey: "Header.links.apps", href: "/c/apps" },
            { labelKey: "Header.links.servicePlans", href: "/c/subscription-plans" },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.discover",
          links: [
            { labelKey: "Header.links.garminCoach", href: `${G}/garmin-coach/overview/` },
            { labelKey: "Header.links.garminMarathonSeries", href: `${G}/garmin-marathon-series/` },
            { labelKey: "Header.links.garminPay", href: "/minisite/garmin-pay" },
            { labelKey: "Header.links.garminTechnology", href: `${G}/garmin-technology/` },
            { labelKey: "Header.links.watchFinder", href: `${G}/which-watch/` },
          ],
        },
        {
          headingKey: "Header.groups.communities",
          links: [
            { labelKey: "Header.links.garminPros", href: `${G}/pros/` },
            { labelKey: "Header.links.studentAthletes", href: "/c/student-athlete-smartwatches" },
          ],
        },
      ],
    ],
    promos: [
      holidayPromo,
      {
        titleKey: "Header.promos.edge1060.title",
        copyKey: "Header.promos.edge1060.copy",
        href: `${G}/p/1967830/`,
        image: "/homepage/nav/87258-TN-NEW.jpg",
      },
    ],
  },
  {
    labelKey: "Header.nav.outdoorRecreation",
    categoryKey: "outdoor-recreation",
    href: "/c/outdoor-recreation",
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.handhelds", href: "/c/outdoor-recreation/handheld-hiking-gps" },
            { labelKey: "Header.links.satelliteCommunicators", href: "/c/outdoor-recreation/satellite-communicators" },
            { labelKey: "Header.links.offRoadMotorsports", href: "/c/automotive/motorsports" },
            { labelKey: "Header.links.adventureWatches", href: "/c/outdoor-recreation/adventure-smartwatches" },
            { labelKey: "Header.links.designYourOwnWatch", href: "/c/wearables-smartwatches/design-your-own-watch" },
            { labelKey: "Header.links.sportsmanTactical", href: "/c/outdoor-recreation/sportsman-and-tactical-devices" },
            { labelKey: "Header.links.dogTrackingTraining", href: "/c/outdoor-recreation/sporting-dog-tracking-training-devices" },
            { labelKey: "Header.links.optics", href: "/c/outdoor-recreation/optics" },
            { labelKey: "Header.links.equine", href: "/c/outdoor-recreation/equine" },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.maps",
          links: [
            { labelKey: "Header.links.outdoorMaps", href: "/c/outdoor-maps" },
            { labelKey: "Header.links.delormeAtlasGazetteer", href: "/c/delorme-atlas-gazetteer" },
          ],
        },
        {
          headingKey: "Header.groups.accessoriesPlans",
          links: [
            { labelKey: "Header.links.apps", href: "/c/apps" },
            { labelKey: "Header.links.servicePlans", href: "/c/subscription-plans" },
            { labelKey: "Header.links.inreachAccount", href: "https://inreach.garmin.com/en-US/" },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.discover",
          links: [
            { labelKey: "Header.links.garminPay", href: "/minisite/garmin-pay" },
            { labelKey: "Header.links.garminTechnology", href: `${G}/garmin-technology/` },
            { labelKey: "Header.links.watchFinder", href: `${G}/which-watch/` },
          ],
        },
        {
          headingKey: "Header.groups.communities",
          links: [
            { labelKey: "Header.links.garminPros", href: `${G}/pros/` },
            { labelKey: "Header.links.womenOfAdventure", href: `${G}/women-of-adventure/` },
          ],
        },
      ],
    ],
    promos: [holidayPromo, fenixPromo],
  },
  {
    labelKey: "Header.nav.autoHome",
    categoryKey: "auto-home",
    href: "/c/auto-home",
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.carsRvCameras", href: "/c/automotive/car-gps-navigation" },
            { labelKey: "Header.links.motorcycles", href: "/c/automotive/motorcycle-gps-navigation" },
            { labelKey: "Header.links.trucks", href: "/c/automotive/semi-truck-gps-navigation" },
            { labelKey: "Header.links.offRoadMotorsports", href: "/c/automotive/motorsports" },
            { labelKey: "Header.links.carAudio", href: "/c/automotive/jl-audio-car-audio" },
            { labelKey: "Header.links.homeAudio", href: "/c/home-audio-systems" },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.maps",
          links: [
            { labelKey: "Header.links.mapUpdates", href: `${G}/maps/updates/automotive/` },
            { labelKey: "Header.links.purchaseNewMaps", href: "/c/road-maps" },
            { labelKey: "Header.links.inDashMaps", href: "https://auto-oem.garmin.com/landing/site" },
            { labelKey: "Header.links.offRoadMaps", href: "https://www.garmin.com/off-road-maps/" },
          ],
        },
        {
          headingKey: "Header.groups.accessoriesPlans",
          links: [
            { labelKey: "Header.links.apps", href: "/c/apps" },
            { labelKey: "Header.links.servicePlans", href: "/c/subscription-plans" },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.oemSolutions",
          links: [
            { labelKey: "Header.links.automotive", href: `${G}/aoem/` },
            { labelKey: "Header.links.rv", href: `${G}/rv-oem/overview/` },
          ],
        },
        {
          headingKey: "Header.groups.discover",
          links: [{ labelKey: "Header.links.stealthbox", href: "/c/automotive/stealthbox-audio" }],
        },
      ],
    ],
    promos: [
      holidayPromo,
      {
        titleKey: "Header.promos.garminDrive.title",
        copyKey: "Header.promos.garminDrive.copy",
        href: `${G}/p/1944903/`,
        image: "/homepage/nav/86252-TOP-NAV.jpg",
      },
    ],
  },
  {
    labelKey: "Header.nav.marine",
    categoryKey: "marine",
    href: "/c/marine",
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.chartplottersFishfinders", href: "/c/marine/chartplotters" },
            { labelKey: "Header.links.liveSonar", href: "/c/marine/live-sonar" },
            { labelKey: "Header.links.audio", href: "/c/marine/audio" },
            { labelKey: "Header.links.transducers", href: "/c/marine/boat-sonar-transducers" },
            { labelKey: "Header.links.trollingMotors", href: "/c/marine/trolling-motors" },
            { labelKey: "Header.links.iceFishingBundlesKits", href: "/c/marine/ice-fishing-bundles" },
            { labelKey: "Header.links.radar", href: "/c/marine/boat-radars" },
            { labelKey: "Header.links.autopilots", href: "/c/marine/boat-autopilots" },
            { labelKey: "Header.links.lighting", href: "/c/marine/lighting" },
            { labelKey: "Header.links.handheldsSmartwatches", href: "/c/marine/handhelds-gps-and-watches" },
            { labelKey: "Header.links.vhfAis", href: "/c/marine/vhf-ais-marine-radios" },
            { labelKey: "Header.links.sonarBlackBoxes", href: "/c/marine/sonar-black-boxes" },
          ],
        },
      ],
      [
        {
          // The live site renders this continuation group with an empty heading.
          links: [
            { labelKey: "Header.links.antennasSensors", href: "/c/marine/boat-sensors-antennas" },
            { labelKey: "Header.links.cameras", href: "/c/marine/boat-cameras" },
            { labelKey: "Header.links.sailing", href: "/c/marine/sailing" },
            { labelKey: "Header.links.digitalSwitching", href: "/c/marine/digital-switching" },
            { labelKey: "Header.links.engineCutoffMob", href: "/c/marine/engine-cutoff-mob" },
          ],
        },
        {
          headingKey: "Header.groups.appsPlans",
          links: [
            { labelKey: "Header.links.apps", href: "/c/marine/marine-apps" },
            { labelKey: "Header.links.servicePlans", href: "/c/subscription-plans" },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.chartsMaps",
          links: [
            { labelKey: "Header.links.newCharts", href: "https://maps.garmin.com/marine/" },
            { labelKey: "Header.links.builtInUpdates", href: `${G}/p/802644/pn/010-13177-00` },
            { labelKey: "Header.links.updatingCharts", href: `${G}/marine/update-now/` },
            { labelKey: "Header.links.navionicsBoatingApp", href: `${G}/p/904463/` },
          ],
        },
        {
          headingKey: "Header.groups.discover",
          links: [
            { labelKey: "Header.links.garminTechnology", href: `${G}/garmin-technology/marine-technology/` },
            { labelKey: "Header.links.integration", href: `${G}/marine-integrations/` },
            { labelKey: "Header.links.softwareUpdates", href: `${G}/support/software/marine/` },
            { labelKey: "Header.links.systemBuilder", href: `${G}/marine-system-builder/` },
          ],
        },
        {
          headingKey: "Header.groups.communities",
          links: [
            { labelKey: "Header.links.garminPros", href: `${G}/pros/anglers/` },
            { labelKey: "Header.links.activecaptain", href: `${G}/p/804601/` },
          ],
        },
      ],
    ],
    promos: [holidayPromo],
  },
  {
    labelKey: "Header.nav.aviation",
    categoryKey: "aviation",
    href: "/c/aviation",
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.navigationRadios", href: "/c/aviation/navigation-radios" },
            { labelKey: "Header.links.autopilots", href: "/c/aviation/autopilot-systems" },
            { labelKey: "Header.links.flightDisplaysInstruments", href: "/c/aviation/flight-displays-instruments" },
            { labelKey: "Header.links.engineIndicationSystems", href: "/c/aviation/engine-indication-systems" },
            { labelKey: "Header.links.integratedFlightDecks", href: "/c/aviation/flight-decks" },
            { labelKey: "Header.links.datalinksConnectivity", href: "/c/aviation/datalinks-connected-cockpit" },
            { labelKey: "Header.links.audioPanels", href: "/c/aviation/audio-panels" },
            { labelKey: "Header.links.weather", href: "/c/aviation/weather-solutions" },
            { labelKey: "Header.links.traffic", href: "/c/aviation/traffic-surveillance-systems" },
            { labelKey: "Header.links.adsBTransponders", href: "/c/aviation/ads-b-transponders" },
            { labelKey: "Header.links.portableGpsWearables", href: "/c/aviation/gps-wearables-apps" },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.markets",
          links: [
            { labelKey: "Header.links.generalAviation", href: "/c/aviation/general" },
            { labelKey: "Header.links.businessAviation", href: "/c/aviation/business" },
            { labelKey: "Header.links.experimental", href: "/c/aviation/experimental" },
            { labelKey: "Header.links.helicopters", href: "/c/aviation/helicopters" },
            { labelKey: "Header.links.governmentDefense", href: `${G}/aviation/government-defense/` },
          ],
        },
        {
          headingKey: "Header.groups.appsServices",
          links: [
            { labelKey: "Header.links.garminPilot", href: `${G}/aviation/garminpilot/overview/` },
            { labelKey: "Header.links.safetyManagementSystem", href: `${G}/aviation/fltplan/fltplan-sms/` },
            { labelKey: "Header.links.aerodata", href: "https://www.aerodata.co/en-US/" },
            { labelKey: "Header.links.flygarmin", href: "https://fly.garmin.com/" },
            { labelKey: "Header.links.fltplanServices", href: `${G}/aviation/fltplan/` },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.aviationDatabases",
          links: [{ labelKey: "Header.links.aviationDatabaseUpdates", href: "https://fly.garmin.com/fly-garmin/devices/overview" }],
        },
        {
          headingKey: "Header.groups.discover",
          links: [
            { labelKey: "Header.links.autonomi", href: `${G}/autonomi/` },
            { labelKey: "Header.links.planesync", href: `${G}/planesync/` },
            { labelKey: "Header.links.promotions", href: `${G}/promotions/aviation/` },
            { labelKey: "Header.links.support", href: "https://support.garmin.com/en-US/aviation/" },
            { labelKey: "Header.links.training", href: `${G}/aviation/training/` },
          ],
        },
      ],
    ],
    promos: [
      holidayPromo,
      {
        titleKey: "Header.promos.axis.title",
        copyKey: "Header.promos.axis.copy",
        href: `${G}/aviation/axis/overview/`,
        image: "/homepage/nav/80687-TN-NEW.jpg",
      },
    ],
  },
  {
    labelKey: "Header.nav.sale",
    categoryKey: "promotions",
    href: "/c/promotions",
  },
];

export const takeoverBar = {
  labelKey: "Header.takeover",
  href: "/c/promotions",
};

/**
 * Mega-menu links that intentionally stay on garmin.com: the store does not sell the item, or the page is
 * informational (technology, communities, OEM programmes, tools, subscriptions and support hosted by Garmin).
 */
export const EXTERNAL_NAV_LINKS: readonly { href: string; reason: string }[] = [
  // Informational / editorial
  { href: `${G}/garmin-technology/`, reason: "informational: technology overview" },
  { href: `${G}/garmin-technology/marine-technology/`, reason: "informational: technology overview" },
  { href: `${G}/which-watch/`, reason: "informational: Garmin's watch finder tool" },
  { href: `${G}/garmin-coach/overview/`, reason: "informational: free training plans" },
  { href: `${G}/garmin-marathon-series/`, reason: "informational: event series" },
  { href: `${G}/pros/`, reason: "community: sponsored athletes" },
  { href: `${G}/pros/anglers/`, reason: "community: sponsored anglers" },
  { href: `${G}/women-of-adventure/`, reason: "community: editorial" },
  { href: `${G}/marine-integrations/`, reason: "informational: partner integrations" },
  { href: `${G}/autonomi/`, reason: "informational: aviation technology" },
  { href: `${G}/planesync/`, reason: "informational: aviation technology" },
  { href: `${G}/aviation/axis/overview/`, reason: "informational: certified avionics, dealer installed" },
  { href: `${G}/aviation/government-defense/`, reason: "informational: government programmes" },
  { href: `${G}/aviation/training/`, reason: "informational: avionics training" },
  { href: `${G}/promotions/aviation/`, reason: "informational: US aviation dealer promotions" },
  // Tools, map/chart/software updates and services run by Garmin
  { href: `${G}/golf-courses/`, reason: "tool: golf course locator" },
  { href: `${G}/maps/updates/automotive/`, reason: "service: map updates for owned devices" },
  { href: `${G}/marine/update-now/`, reason: "service: chart updates" },
  { href: `${G}/support/software/marine/`, reason: "service: software updates" },
  { href: `${G}/marine-system-builder/`, reason: "tool: marine system configurator" },
  { href: `${G}/aviation/garminpilot/overview/`, reason: "service: Garmin Pilot subscription" },
  { href: `${G}/aviation/fltplan/fltplan-sms/`, reason: "service: FltPlan SMS" },
  { href: `${G}/aviation/fltplan/`, reason: "service: FltPlan" },
  { href: "https://inreach.garmin.com/en-US/", reason: "service: inReach account" },
  { href: "https://auto-oem.garmin.com/landing/site", reason: "service: in-dash map updates" },
  { href: "https://www.garmin.com/off-road-maps/", reason: "service: off-road map subscriptions" },
  { href: "https://maps.garmin.com/marine/", reason: "service: marine chart store" },
  { href: "https://www.aerodata.co/en-US/", reason: "service: AeroData (third party)" },
  { href: "https://fly.garmin.com/", reason: "service: flyGarmin" },
  { href: "https://fly.garmin.com/fly-garmin/devices/overview", reason: "service: aviation database updates" },
  { href: "https://support.garmin.com/en-US/aviation/", reason: "service: support" },
  // OEM programmes (not retail)
  { href: `${G}/aoem/`, reason: "OEM programme, not retail" },
  { href: `${G}/rv-oem/overview/`, reason: "OEM programme, not retail" },
  // Products the store does not sell (no local product page)
  { href: `${G}/p/730831`, reason: "not sold: Cycling Maps" },
  { href: `${G}/p/1967830/`, reason: "not sold: Edge 1060 (promo)" },
  { href: `${G}/p/1944903/`, reason: "not sold: Garmin Drive navigators (promo)" },
  { href: `${G}/p/802644/pn/010-13177-00`, reason: "not sold: built-in chart updates" },
  { href: `${G}/p/904463/`, reason: "not sold: Navionics Boating app subscription" },
  { href: `${G}/p/804601/`, reason: "not sold: ActiveCaptain app" },
];
