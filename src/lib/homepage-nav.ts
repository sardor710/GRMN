// Mega-menu content captured from https://www.garmin.com/en-US/ (2026-11-17).
// Links that have a local equivalent in this clone point to the local route.
// Labels are message keys (messages/*.json, `Header` namespace) resolved with `t()` where rendered.

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
  /** Up to three link columns, each holding one or more groups. */
  columns?: MegaGroup[][];
  promos?: MegaPromo[];
}

const G = "https://www.garmin.com/en-US";

const holidayPromo: MegaPromo = {
  titleKey: "Header.promos.holidaySale.title",
  copyKey: "Header.promos.holidaySale.copy",
  href: `${G}/c/promotions/holiday-sale-guide-americas/`,
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
    href: "/c/wearables-smartwatches",
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.allSmartwatches", href: "/c/wearables-smartwatches" },
            { labelKey: "Header.links.healthFitnessTracking", href: `${G}/c/sports-fitness/activity-fitness-trackers/` },
            { labelKey: "Header.links.designYourOwnWatch", href: `${G}/your-watch-your-way/` },
            { labelKey: "Header.links.watchesForWomen", href: `${G}/c/women-wearables/?FILTER_FEATURE_FORWOMEN=true` },
            { labelKey: "Header.links.fashionHybridSmartwatches", href: `${G}/c/sports-fitness/fashion-hybrid-smartwatches/` },
            { labelKey: "Header.links.marqLuxuryWatchCollection", href: "/minisite/marq" },
            { labelKey: "Header.links.running", href: "/c/sports-fitness/running-smartwatches" },
            { labelKey: "Header.links.multisportTriathlete", href: `${G}/c/sports-fitness/multisport-smartwatches/` },
            { labelKey: "Header.links.adventure", href: `${G}/c/outdoor-recreation/adventure-smartwatches/` },
            { labelKey: "Header.links.swimming", href: `${G}/c/sports-fitness/swimming-smartwatches/` },
            { labelKey: "Header.links.diving", href: `${G}/c/sports-fitness/dive-computers-smartwatches/` },
            { labelKey: "Header.links.golf", href: `${G}/c/sports-fitness/golf-gps-devices-smartwatches/` },
            { labelKey: "Header.links.kidsSmartwatches", href: `${G}/c/sports-fitness/kids-wearables-fitness-activity-trackers/` },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.maps",
          links: [
            { labelKey: "Header.links.outdoorMaps", href: `${G}/c/wearables-mapping/` },
            { labelKey: "Header.links.golfCourseLocator", href: `${G}/golf-courses/` },
          ],
        },
        {
          headingKey: "Header.groups.accessoriesPlans",
          links: [
            { labelKey: "Header.links.accessories", href: `${G}/c/wearables-smartwatches-accessories/` },
            { labelKey: "Header.links.apps", href: `${G}/c/apps/` },
            { labelKey: "Header.links.servicePlans", href: `${G}/c/subscription-plans/` },
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
    href: "/c/sports-fitness/running-smartwatches",
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.running", href: "/c/sports-fitness/running-smartwatches" },
            { labelKey: "Header.links.healthFitnessTracking", href: `${G}/c/sports-fitness/activity-fitness-trackers/` },
            { labelKey: "Header.links.cirqaSmartBand", href: `${G}/p/1989182/` },
            { labelKey: "Header.links.cycling", href: `${G}/c/sports-fitness/cycling-bike-computers-bike-radar-power-meter-headlights/` },
            { labelKey: "Header.links.tacxIndoorCycling", href: `${G}/c/sports-fitness/indoor-trainers/` },
            { labelKey: "Header.links.designYourOwnWatch", href: `${G}/your-watch-your-way/` },
            { labelKey: "Header.links.golf", href: `${G}/c/sports-fitness/golf-gps-devices-smartwatches/` },
            { labelKey: "Header.links.multisportTriathlete", href: `${G}/c/sports-fitness/multisport-smartwatches/` },
            { labelKey: "Header.links.swimming", href: `${G}/c/sports-fitness/swimming-smartwatches/` },
            { labelKey: "Header.links.diving", href: `${G}/c/sports-fitness/dive-computers-smartwatches/` },
            { labelKey: "Header.links.scalesMonitors", href: `${G}/c/sports-fitness/scales-monitors/` },
            { labelKey: "Header.links.kidsSmartwatches", href: `${G}/c/sports-fitness/kids-wearables-fitness-activity-trackers/` },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.maps",
          links: [
            { labelKey: "Header.links.cyclingMaps", href: `${G}/p/730831` },
            { labelKey: "Header.links.outdoorMaps", href: `${G}/c/wearables-mapping/` },
            { labelKey: "Header.links.golfCourseLocator", href: `${G}/golf-courses/` },
          ],
        },
        {
          headingKey: "Header.groups.accessoriesPlans",
          links: [
            { labelKey: "Header.links.smartwatchAccessories", href: `${G}/c/wearables-smartwatches-accessories/` },
            { labelKey: "Header.links.cyclingAccessories", href: `${G}/c/sports-fitness/cycling-biking-accessories/` },
            { labelKey: "Header.links.indoorTrainingAccessories", href: `${G}/c/sports-fitness/indoor-training/accessories/` },
            { labelKey: "Header.links.apps", href: `${G}/c/apps/` },
            { labelKey: "Header.links.servicePlans", href: `${G}/c/subscription-plans/` },
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
            { labelKey: "Header.links.studentAthletes", href: `${G}/c/student-athlete-smartwatches/` },
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
    href: `${G}/c/outdoor-recreation/handheld-hiking-gps/`,
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.handhelds", href: `${G}/c/outdoor-recreation/handheld-hiking-gps/` },
            { labelKey: "Header.links.satelliteCommunicators", href: `${G}/c/outdoor-recreation/satellite-communicators/` },
            { labelKey: "Header.links.offRoadMotorsports", href: `${G}/c/automotive/motorsports/` },
            { labelKey: "Header.links.adventureWatches", href: `${G}/c/outdoor-recreation/adventure-smartwatches/` },
            { labelKey: "Header.links.designYourOwnWatch", href: `${G}/your-watch-your-way/` },
            { labelKey: "Header.links.sportsmanTactical", href: `${G}/c/outdoor-recreation/sportsman-and-tactical-devices/` },
            { labelKey: "Header.links.dogTrackingTraining", href: `${G}/c/outdoor-recreation/sporting-dog-tracking-training-devices/` },
            { labelKey: "Header.links.optics", href: `${G}/p/798183/` },
            { labelKey: "Header.links.equine", href: `${G}/p/1277934` },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.maps",
          links: [
            { labelKey: "Header.links.outdoorMaps", href: `${G}/c/outdoor-maps/` },
            { labelKey: "Header.links.delormeAtlasGazetteer", href: `${G}/c/delorme-atlas-gazetteer/` },
          ],
        },
        {
          headingKey: "Header.groups.accessoriesPlans",
          links: [
            { labelKey: "Header.links.apps", href: `${G}/c/apps/` },
            { labelKey: "Header.links.servicePlans", href: `${G}/c/subscription-plans/` },
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
    href: `${G}/c/automotive/car-gps-navigation/`,
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.carsRvCameras", href: `${G}/c/automotive/car-gps-navigation/` },
            { labelKey: "Header.links.motorcycles", href: `${G}/c/automotive/motorcycle-gps-navigation/` },
            { labelKey: "Header.links.trucks", href: `${G}/c/automotive/semi-truck-gps-navigation/` },
            { labelKey: "Header.links.offRoadMotorsports", href: `${G}/c/automotive/motorsports/` },
            { labelKey: "Header.links.carAudio", href: `${G}/c/automotive/jl-audio-car-audio/` },
            { labelKey: "Header.links.homeAudio", href: `${G}/c/home-audio-systems/` },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.maps",
          links: [
            { labelKey: "Header.links.mapUpdates", href: `${G}/maps/updates/automotive/` },
            { labelKey: "Header.links.purchaseNewMaps", href: `${G}/c/road-maps/` },
            { labelKey: "Header.links.inDashMaps", href: "https://auto-oem.garmin.com/landing/site" },
            { labelKey: "Header.links.offRoadMaps", href: "https://www.garmin.com/off-road-maps/" },
          ],
        },
        {
          headingKey: "Header.groups.accessoriesPlans",
          links: [
            { labelKey: "Header.links.apps", href: `${G}/c/apps/` },
            { labelKey: "Header.links.servicePlans", href: `${G}/c/subscription-plans/` },
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
          links: [{ labelKey: "Header.links.stealthbox", href: `${G}/c/automotive/stealthbox-audio/` }],
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
    href: `${G}/c/marine/chartplotters/`,
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.chartplottersFishfinders", href: `${G}/c/marine/chartplotters/` },
            { labelKey: "Header.links.liveSonar", href: `${G}/c/marine/live-sonar/` },
            { labelKey: "Header.links.audio", href: `${G}/c/marine/audio/` },
            { labelKey: "Header.links.transducers", href: `${G}/c/marine/boat-sonar-transducers/` },
            { labelKey: "Header.links.trollingMotors", href: `${G}/c/marine/trolling-motors/` },
            { labelKey: "Header.links.iceFishingBundlesKits", href: `${G}/c/marine/ice-fishing-bundles/` },
            { labelKey: "Header.links.radar", href: `${G}/c/marine/boat-radars/` },
            { labelKey: "Header.links.autopilots", href: `${G}/c/marine/boat-autopilots/` },
            { labelKey: "Header.links.lighting", href: `${G}/c/marine/lighting/` },
            { labelKey: "Header.links.handheldsSmartwatches", href: `${G}/c/marine/handhelds-gps-and-watches/` },
            { labelKey: "Header.links.vhfAis", href: `${G}/c/marine/vhf-ais-marine-radios/` },
            { labelKey: "Header.links.sonarBlackBoxes", href: `${G}/c/marine/sonar-black-boxes/` },
          ],
        },
      ],
      [
        {
          // The live site renders this continuation group with an empty heading.
          links: [
            { labelKey: "Header.links.antennasSensors", href: `${G}/c/marine/boat-sensors-antennas/` },
            { labelKey: "Header.links.cameras", href: `${G}/c/marine/boat-cameras/` },
            { labelKey: "Header.links.sailing", href: `${G}/c/marine/sailing/` },
            { labelKey: "Header.links.digitalSwitching", href: `${G}/c/marine/digital-switching/` },
            { labelKey: "Header.links.engineCutoffMob", href: `${G}/p/1229049/` },
          ],
        },
        {
          headingKey: "Header.groups.appsPlans",
          links: [
            { labelKey: "Header.links.apps", href: `${G}/c/marine/marine-apps/` },
            { labelKey: "Header.links.servicePlans", href: `${G}/c/subscription-plans/` },
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
    href: `${G}/c/aviation/navigation-radios/`,
    columns: [
      [
        {
          headingKey: "Header.groups.products",
          links: [
            { labelKey: "Header.links.navigationRadios", href: `${G}/c/aviation/navigation-radios/` },
            { labelKey: "Header.links.autopilots", href: `${G}/c/aviation/autopilot-systems/` },
            { labelKey: "Header.links.flightDisplaysInstruments", href: `${G}/c/aviation/flight-displays-instruments/` },
            { labelKey: "Header.links.engineIndicationSystems", href: `${G}/aviation/eis-buyers-guide/` },
            { labelKey: "Header.links.integratedFlightDecks", href: `${G}/c/aviation/flight-decks/` },
            { labelKey: "Header.links.datalinksConnectivity", href: `${G}/c/aviation/datalinks-connected-cockpit/` },
            { labelKey: "Header.links.audioPanels", href: `${G}/c/aviation/audio-panels/` },
            { labelKey: "Header.links.weather", href: `${G}/c/aviation/weather-solutions/` },
            { labelKey: "Header.links.traffic", href: `${G}/c/aviation/traffic-surveillance-systems/` },
            { labelKey: "Header.links.adsBTransponders", href: `${G}/aviation/adsb-solutions/` },
            { labelKey: "Header.links.portableGpsWearables", href: `${G}/c/aviation/gps-wearables-apps/` },
          ],
        },
      ],
      [
        {
          headingKey: "Header.groups.markets",
          links: [
            { labelKey: "Header.links.generalAviation", href: `${G}/c/aviation/general/` },
            { labelKey: "Header.links.businessAviation", href: `${G}/c/aviation/business/` },
            { labelKey: "Header.links.experimental", href: `${G}/c/aviation/experimental/` },
            { labelKey: "Header.links.helicopters", href: `${G}/c/aviation/helicopters/` },
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
    href: `${G}/c/promotions/`,
  },
];

export const takeoverBar = {
  labelKey: "Header.takeover",
  href: `${G}/c/promotions/holiday-sale-guide-americas/`,
};
