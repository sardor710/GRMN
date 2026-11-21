// Mega-menu content captured from https://www.garmin.com/en-US/ (2026-11-17).
// M4.4: every category/subcategory with a taxonomy node (src/server/catalog/taxonomy-seed.ts) links to its local
// /c/<slug> page; a top-level menu item opens its root node. The holiday sale promo and takeover bar open the
// local Sale page (/c/promotions). Only the links in EXTERNAL_NAV_LINKS stay on garmin.com (see the reasons
// there); tests/unit/nav-links.test.mjs enforces both rules.

export interface MegaLink {
  label: string;
  href: string;
}

export interface MegaGroup {
  heading: string;
  links: MegaLink[];
}

export interface MegaPromo {
  title: string;
  copy: string;
  href: string;
  image: string;
}

export interface MegaNavItem {
  label: string;
  href: string;
  /** Up to three link columns, each holding one or more groups. */
  columns?: MegaGroup[][];
  promos?: MegaPromo[];
}

const G = "https://www.garmin.com/en-US";

const holidayPromo: MegaPromo = {
  title: "HOLIDAY SALE",
  copy: "Save big on great holiday gifts",
  href: "/c/promotions",
  image: "/homepage/nav/HOLIDAY-SALE-TOP-NAV.jpg",
};

const fenixPromo: MegaPromo = {
  title: "FĒNIX® 9",
  copy: "The ultimate smartwatch",
  href: "/minisite/fenix-8",
  image: "/homepage/nav/87582-TN-NEW.jpg",
};

export const megaNav: MegaNavItem[] = [
  {
    label: "Smartwatches",
    href: "/c/wearables-smartwatches",
    columns: [
      [
        {
          heading: "Products",
          links: [
            { label: "All Smartwatches", href: "/c/wearables-smartwatches" },
            { label: "Health & Fitness Tracking", href: "/c/sports-fitness/activity-fitness-trackers" },
            { label: "Design Your Own Watch", href: "/c/wearables-smartwatches/design-your-own-watch" },
            { label: "Watches for Women", href: "/c/women-wearables" },
            { label: "Fashion & Hybrid Smartwatches", href: "/c/sports-fitness/fashion-hybrid-smartwatches" },
            { label: "MARQ Luxury Watch Collection", href: "/minisite/marq" },
            { label: "Running", href: "/c/sports-fitness/running-smartwatches" },
            { label: "Multisport & Triathlete", href: "/c/sports-fitness/multisport-smartwatches" },
            { label: "Adventure", href: "/c/outdoor-recreation/adventure-smartwatches" },
            { label: "Swimming", href: "/c/sports-fitness/swimming-smartwatches" },
            { label: "Diving", href: "/c/sports-fitness/dive-computers-smartwatches" },
            { label: "Golf", href: "/c/sports-fitness/golf-gps-devices-smartwatches" },
            { label: "Kids Smartwatches", href: "/c/sports-fitness/kids-wearables-fitness-activity-trackers" },
          ],
        },
      ],
      [
        {
          heading: "Maps",
          links: [
            { label: "Outdoor Maps", href: "/c/wearables-mapping" },
            { label: "Golf Course Locator", href: `${G}/golf-courses/` },
          ],
        },
        {
          heading: "Accessories & Plans",
          links: [
            { label: "Accessories", href: "/c/wearables-smartwatches-accessories" },
            { label: "Apps", href: "/c/apps" },
            { label: "Service Plans", href: "/c/subscription-plans" },
          ],
        },
      ],
      [
        {
          heading: "Discover",
          links: [
            { label: "Garmin Pay", href: "/minisite/garmin-pay" },
            { label: "Garmin Technology", href: `${G}/garmin-technology/` },
            { label: "Watch Finder", href: `${G}/which-watch/` },
          ],
        },
      ],
    ],
    promos: [holidayPromo, fenixPromo],
  },
  {
    label: "Sports & Fitness",
    href: "/c/sports-fitness/running-smartwatches",
    columns: [
      [
        {
          heading: "Products",
          links: [
            { label: "Running", href: "/c/sports-fitness/running-smartwatches" },
            { label: "Health & Fitness Tracking", href: "/c/sports-fitness/activity-fitness-trackers" },
            { label: "CIRQA™ Smart Band", href: "/c/sports-fitness/cirqa-smart-band" },
            { label: "Cycling", href: "/c/sports-fitness/cycling-bike-computers-bike-radar-power-meter-headlights" },
            { label: "Tacx® Indoor Cycling", href: "/c/sports-fitness/indoor-trainers" },
            { label: "Design Your Own Watch", href: "/c/wearables-smartwatches/design-your-own-watch" },
            { label: "Golf", href: "/c/sports-fitness/golf-gps-devices-smartwatches" },
            { label: "Multisport & Triathlete", href: "/c/sports-fitness/multisport-smartwatches" },
            { label: "Swimming", href: "/c/sports-fitness/swimming-smartwatches" },
            { label: "Diving", href: "/c/sports-fitness/dive-computers-smartwatches" },
            { label: "Scales & Monitors", href: "/c/sports-fitness/scales-monitors" },
            { label: "Kids Smartwatches", href: "/c/sports-fitness/kids-wearables-fitness-activity-trackers" },
          ],
        },
      ],
      [
        {
          heading: "Maps",
          links: [
            { label: "Cycling Maps", href: `${G}/p/730831` },
            { label: "Outdoor Maps", href: "/c/wearables-mapping" },
            { label: "Golf Course Locator", href: `${G}/golf-courses/` },
          ],
        },
        {
          heading: "Accessories & Plans",
          links: [
            { label: "Smartwatch Accessories", href: "/c/wearables-smartwatches-accessories" },
            { label: "Cycling Accessories", href: "/c/sports-fitness/cycling-biking-accessories" },
            { label: "Indoor Training Accessories", href: "/c/sports-fitness/indoor-training/accessories" },
            { label: "Apps", href: "/c/apps" },
            { label: "Service Plans", href: "/c/subscription-plans" },
          ],
        },
      ],
      [
        {
          heading: "Discover",
          links: [
            { label: "Garmin Coach", href: `${G}/garmin-coach/overview/` },
            { label: "Garmin Marathon Series", href: `${G}/garmin-marathon-series/` },
            { label: "Garmin Pay", href: "/minisite/garmin-pay" },
            { label: "Garmin Technology", href: `${G}/garmin-technology/` },
            { label: "Watch Finder", href: `${G}/which-watch/` },
          ],
        },
        {
          heading: "Communities",
          links: [
            { label: "Garmin Pros", href: `${G}/pros/` },
            { label: "Student Athletes", href: "/c/student-athlete-smartwatches" },
          ],
        },
      ],
    ],
    promos: [
      holidayPromo,
      {
        title: "EDGE® 1060",
        copy: "Premium cycling computer with hands-free voice control",
        href: `${G}/p/1967830/`,
        image: "/homepage/nav/87258-TN-NEW.jpg",
      },
    ],
  },
  {
    label: "Outdoor Recreation",
    href: "/c/outdoor-recreation",
    columns: [
      [
        {
          heading: "Products",
          links: [
            { label: "Handhelds", href: "/c/outdoor-recreation/handheld-hiking-gps" },
            { label: "Satellite Communicators", href: "/c/outdoor-recreation/satellite-communicators" },
            { label: "Off-Road & Motorsports", href: "/c/automotive/motorsports" },
            { label: "Adventure Watches", href: "/c/outdoor-recreation/adventure-smartwatches" },
            { label: "Design Your Own Watch", href: "/c/wearables-smartwatches/design-your-own-watch" },
            { label: "Sportsman & Tactical", href: "/c/outdoor-recreation/sportsman-and-tactical-devices" },
            { label: "Dog Tracking & Training", href: "/c/outdoor-recreation/sporting-dog-tracking-training-devices" },
            { label: "Optics", href: "/c/outdoor-recreation/optics" },
            { label: "Equine", href: "/c/outdoor-recreation/equine" },
          ],
        },
      ],
      [
        {
          heading: "Maps",
          links: [
            { label: "Outdoor Maps", href: "/c/outdoor-maps" },
            { label: "DeLorme Atlas & Gazetteer", href: "/c/delorme-atlas-gazetteer" },
          ],
        },
        {
          heading: "Accessories & Plans",
          links: [
            { label: "Apps", href: "/c/apps" },
            { label: "Service Plans", href: "/c/subscription-plans" },
            { label: "inReach Account", href: "https://inreach.garmin.com/en-US/" },
          ],
        },
      ],
      [
        {
          heading: "Discover",
          links: [
            { label: "Garmin Pay", href: "/minisite/garmin-pay" },
            { label: "Garmin Technology", href: `${G}/garmin-technology/` },
            { label: "Watch Finder", href: `${G}/which-watch/` },
          ],
        },
        {
          heading: "Communities",
          links: [
            { label: "Garmin Pros", href: `${G}/pros/` },
            { label: "Women of Adventure", href: `${G}/women-of-adventure/` },
          ],
        },
      ],
    ],
    promos: [holidayPromo, fenixPromo],
  },
  {
    label: "Auto & Home",
    href: "/c/auto-home",
    columns: [
      [
        {
          heading: "Products",
          links: [
            { label: "Cars, RV & Cameras", href: "/c/automotive/car-gps-navigation" },
            { label: "Motorcycles", href: "/c/automotive/motorcycle-gps-navigation" },
            { label: "Trucks", href: "/c/automotive/semi-truck-gps-navigation" },
            { label: "Off-Road & Motorsports", href: "/c/automotive/motorsports" },
            { label: "Car Audio", href: "/c/automotive/jl-audio-car-audio" },
            { label: "Home Audio", href: "/c/home-audio-systems" },
          ],
        },
      ],
      [
        {
          heading: "Maps",
          links: [
            { label: "Map Updates", href: `${G}/maps/updates/automotive/` },
            { label: "Purchase New Maps", href: "/c/road-maps" },
            { label: "In-Dash Maps", href: "https://auto-oem.garmin.com/landing/site" },
            { label: "Off-Road Maps", href: "https://www.garmin.com/off-road-maps/" },
          ],
        },
        {
          heading: "Accessories & Plans",
          links: [
            { label: "Apps", href: "/c/apps" },
            { label: "Service Plans", href: "/c/subscription-plans" },
          ],
        },
      ],
      [
        {
          heading: "OEM Solutions",
          links: [
            { label: "Automotive", href: `${G}/aoem/` },
            { label: "RV", href: `${G}/rv-oem/overview/` },
          ],
        },
        {
          heading: "Discover",
          links: [{ label: "Stealthbox®", href: "/c/automotive/stealthbox-audio" }],
        },
      ],
    ],
    promos: [
      holidayPromo,
      {
        title: "GARMIN DRIVE™ NAVIGATORS",
        copy: "Simplify your drive with new ultrawide displays",
        href: `${G}/p/1944903/`,
        image: "/homepage/nav/86252-TOP-NAV.jpg",
      },
    ],
  },
  {
    label: "Marine",
    href: "/c/marine",
    columns: [
      [
        {
          heading: "Products",
          links: [
            { label: "Chartplotters & Fishfinders", href: "/c/marine/chartplotters" },
            { label: "Live Sonar", href: "/c/marine/live-sonar" },
            { label: "Audio", href: "/c/marine/audio" },
            { label: "Transducers", href: "/c/marine/boat-sonar-transducers" },
            { label: "Trolling Motors", href: "/c/marine/trolling-motors" },
            { label: "Ice Fishing Bundles & Kits", href: "/c/marine/ice-fishing-bundles" },
            { label: "Radar", href: "/c/marine/boat-radars" },
            { label: "Autopilots", href: "/c/marine/boat-autopilots" },
            { label: "Lighting", href: "/c/marine/lighting" },
            { label: "Handhelds & Smartwatches", href: "/c/marine/handhelds-gps-and-watches" },
            { label: "VHF & AIS", href: "/c/marine/vhf-ais-marine-radios" },
            { label: "Sonar Black Boxes", href: "/c/marine/sonar-black-boxes" },
          ],
        },
      ],
      [
        {
          // The live site renders this continuation group with an empty heading.
          heading: "",
          links: [
            { label: "Antennas & Sensors", href: "/c/marine/boat-sensors-antennas" },
            { label: "Cameras", href: "/c/marine/boat-cameras" },
            { label: "Sailing", href: "/c/marine/sailing" },
            { label: "Digital Switching", href: "/c/marine/digital-switching" },
            { label: "Engine Cutoff/MOB", href: "/c/marine/engine-cutoff-mob" },
          ],
        },
        {
          heading: "Apps & Plans",
          links: [
            { label: "Apps", href: "/c/marine/marine-apps" },
            { label: "Service Plans", href: "/c/subscription-plans" },
          ],
        },
      ],
      [
        {
          heading: "Charts & Maps",
          links: [
            { label: "New Charts", href: "https://maps.garmin.com/marine/" },
            { label: "Built-in Updates", href: `${G}/p/802644/pn/010-13177-00` },
            { label: "Updating Charts", href: `${G}/marine/update-now/` },
            { label: "Navionics Boating App", href: `${G}/p/904463/` },
          ],
        },
        {
          heading: "Discover",
          links: [
            { label: "Garmin Technology", href: `${G}/garmin-technology/marine-technology/` },
            { label: "Integration", href: `${G}/marine-integrations/` },
            { label: "Software Updates", href: `${G}/support/software/marine/` },
            { label: "System Builder", href: `${G}/marine-system-builder/` },
          ],
        },
        {
          heading: "Communities",
          links: [
            { label: "Garmin Pros", href: `${G}/pros/anglers/` },
            { label: "ActiveCaptain", href: `${G}/p/804601/` },
          ],
        },
      ],
    ],
    promos: [holidayPromo],
  },
  {
    label: "Aviation",
    href: "/c/aviation",
    columns: [
      [
        {
          heading: "Products",
          links: [
            { label: "Navigation & Radios", href: "/c/aviation/navigation-radios" },
            { label: "Autopilots", href: "/c/aviation/autopilot-systems" },
            { label: "Flight Displays & Instruments", href: "/c/aviation/flight-displays-instruments" },
            { label: "Engine Indication Systems", href: "/c/aviation/engine-indication-systems" },
            { label: "Integrated Flight Decks", href: "/c/aviation/flight-decks" },
            { label: "Datalinks & Connectivity", href: "/c/aviation/datalinks-connected-cockpit" },
            { label: "Audio Panels", href: "/c/aviation/audio-panels" },
            { label: "Weather", href: "/c/aviation/weather-solutions" },
            { label: "Traffic", href: "/c/aviation/traffic-surveillance-systems" },
            { label: "ADS-B & Transponders", href: "/c/aviation/ads-b-transponders" },
            { label: "Portable GPS & Wearables", href: "/c/aviation/gps-wearables-apps" },
          ],
        },
      ],
      [
        {
          heading: "Markets",
          links: [
            { label: "General Aviation", href: "/c/aviation/general" },
            { label: "Business Aviation", href: "/c/aviation/business" },
            { label: "Experimental", href: "/c/aviation/experimental" },
            { label: "Helicopters", href: "/c/aviation/helicopters" },
            { label: "Government & Defense", href: `${G}/aviation/government-defense/` },
          ],
        },
        {
          heading: "Apps & Services",
          links: [
            { label: "Garmin Pilot", href: `${G}/aviation/garminpilot/overview/` },
            { label: "Safety Management System", href: `${G}/aviation/fltplan/fltplan-sms/` },
            { label: "AeroData", href: "https://www.aerodata.co/en-US/" },
            { label: "flyGarmin", href: "https://fly.garmin.com/" },
            { label: "FltPlan Services", href: `${G}/aviation/fltplan/` },
          ],
        },
      ],
      [
        {
          heading: "Aviation Databases",
          links: [{ label: "Aviation Database Updates", href: "https://fly.garmin.com/fly-garmin/devices/overview" }],
        },
        {
          heading: "Discover",
          links: [
            { label: "Autonomí", href: `${G}/autonomi/` },
            { label: "PlaneSync", href: `${G}/planesync/` },
            { label: "Promotions", href: `${G}/promotions/aviation/` },
            { label: "Support", href: "https://support.garmin.com/en-US/aviation/" },
            { label: "Training", href: `${G}/aviation/training/` },
          ],
        },
      ],
    ],
    promos: [
      holidayPromo,
      {
        title: "AXIS™ FLIGHT DISPLAYS",
        copy: "Integrated flight displays for experimental and certified piston aircraft",
        href: `${G}/aviation/axis/overview/`,
        image: "/homepage/nav/80687-TN-NEW.jpg",
      },
    ],
  },
  {
    label: "Sale",
    href: "/c/promotions",
  },
];

export const takeoverBar = {
  label: "HOLIDAY SALE",
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
