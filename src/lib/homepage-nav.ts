// Mega-menu content captured from https://www.garmin.com/en-US/ (2026-11-17).
// Links that have a local equivalent in this clone point to the local route.

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
  href: `${G}/c/promotions/holiday-sale-guide-americas/`,
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
            { label: "Health & Fitness Tracking", href: `${G}/c/sports-fitness/activity-fitness-trackers/` },
            { label: "Design Your Own Watch", href: `${G}/your-watch-your-way/` },
            { label: "Watches for Women", href: `${G}/c/women-wearables/?FILTER_FEATURE_FORWOMEN=true` },
            { label: "Fashion & Hybrid Smartwatches", href: `${G}/c/sports-fitness/fashion-hybrid-smartwatches/` },
            { label: "MARQ Luxury Watch Collection", href: "/minisite/marq" },
            { label: "Running", href: "/c/sports-fitness/running-smartwatches" },
            { label: "Multisport & Triathlete", href: `${G}/c/sports-fitness/multisport-smartwatches/` },
            { label: "Adventure", href: `${G}/c/outdoor-recreation/adventure-smartwatches/` },
            { label: "Swimming", href: `${G}/c/sports-fitness/swimming-smartwatches/` },
            { label: "Diving", href: `${G}/c/sports-fitness/dive-computers-smartwatches/` },
            { label: "Golf", href: `${G}/c/sports-fitness/golf-gps-devices-smartwatches/` },
            { label: "Kids Smartwatches", href: `${G}/c/sports-fitness/kids-wearables-fitness-activity-trackers/` },
          ],
        },
      ],
      [
        {
          heading: "Maps",
          links: [
            { label: "Outdoor Maps", href: `${G}/c/wearables-mapping/` },
            { label: "Golf Course Locator", href: `${G}/golf-courses/` },
          ],
        },
        {
          heading: "Accessories & Plans",
          links: [
            { label: "Accessories", href: `${G}/c/wearables-smartwatches-accessories/` },
            { label: "Apps", href: `${G}/c/apps/` },
            { label: "Service Plans", href: `${G}/c/subscription-plans/` },
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
            { label: "Health & Fitness Tracking", href: `${G}/c/sports-fitness/activity-fitness-trackers/` },
            { label: "CIRQA™ Smart Band", href: `${G}/p/1989182/` },
            { label: "Cycling", href: `${G}/c/sports-fitness/cycling-bike-computers-bike-radar-power-meter-headlights/` },
            { label: "Tacx® Indoor Cycling", href: `${G}/c/sports-fitness/indoor-trainers/` },
            { label: "Design Your Own Watch", href: `${G}/your-watch-your-way/` },
            { label: "Golf", href: `${G}/c/sports-fitness/golf-gps-devices-smartwatches/` },
            { label: "Multisport & Triathlete", href: `${G}/c/sports-fitness/multisport-smartwatches/` },
            { label: "Swimming", href: `${G}/c/sports-fitness/swimming-smartwatches/` },
            { label: "Diving", href: `${G}/c/sports-fitness/dive-computers-smartwatches/` },
            { label: "Scales & Monitors", href: `${G}/c/sports-fitness/scales-monitors/` },
            { label: "Kids Smartwatches", href: `${G}/c/sports-fitness/kids-wearables-fitness-activity-trackers/` },
          ],
        },
      ],
      [
        {
          heading: "Maps",
          links: [
            { label: "Cycling Maps", href: `${G}/p/730831` },
            { label: "Outdoor Maps", href: `${G}/c/wearables-mapping/` },
            { label: "Golf Course Locator", href: `${G}/golf-courses/` },
          ],
        },
        {
          heading: "Accessories & Plans",
          links: [
            { label: "Smartwatch Accessories", href: `${G}/c/wearables-smartwatches-accessories/` },
            { label: "Cycling Accessories", href: `${G}/c/sports-fitness/cycling-biking-accessories/` },
            { label: "Indoor Training Accessories", href: `${G}/c/sports-fitness/indoor-training/accessories/` },
            { label: "Apps", href: `${G}/c/apps/` },
            { label: "Service Plans", href: `${G}/c/subscription-plans/` },
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
            { label: "Student Athletes", href: `${G}/c/student-athlete-smartwatches/` },
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
    href: `${G}/c/outdoor-recreation/handheld-hiking-gps/`,
    columns: [
      [
        {
          heading: "Products",
          links: [
            { label: "Handhelds", href: `${G}/c/outdoor-recreation/handheld-hiking-gps/` },
            { label: "Satellite Communicators", href: `${G}/c/outdoor-recreation/satellite-communicators/` },
            { label: "Off-Road & Motorsports", href: `${G}/c/automotive/motorsports/` },
            { label: "Adventure Watches", href: `${G}/c/outdoor-recreation/adventure-smartwatches/` },
            { label: "Design Your Own Watch", href: `${G}/your-watch-your-way/` },
            { label: "Sportsman & Tactical", href: `${G}/c/outdoor-recreation/sportsman-and-tactical-devices/` },
            { label: "Dog Tracking & Training", href: `${G}/c/outdoor-recreation/sporting-dog-tracking-training-devices/` },
            { label: "Optics", href: `${G}/p/798183/` },
            { label: "Equine", href: `${G}/p/1277934` },
          ],
        },
      ],
      [
        {
          heading: "Maps",
          links: [
            { label: "Outdoor Maps", href: `${G}/c/outdoor-maps/` },
            { label: "DeLorme Atlas & Gazetteer", href: `${G}/c/delorme-atlas-gazetteer/` },
          ],
        },
        {
          heading: "Accessories & Plans",
          links: [
            { label: "Apps", href: `${G}/c/apps/` },
            { label: "Service Plans", href: `${G}/c/subscription-plans/` },
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
    href: `${G}/c/automotive/car-gps-navigation/`,
    columns: [
      [
        {
          heading: "Products",
          links: [
            { label: "Cars, RV & Cameras", href: `${G}/c/automotive/car-gps-navigation/` },
            { label: "Motorcycles", href: `${G}/c/automotive/motorcycle-gps-navigation/` },
            { label: "Trucks", href: `${G}/c/automotive/semi-truck-gps-navigation/` },
            { label: "Off-Road & Motorsports", href: `${G}/c/automotive/motorsports/` },
            { label: "Car Audio", href: `${G}/c/automotive/jl-audio-car-audio/` },
            { label: "Home Audio", href: `${G}/c/home-audio-systems/` },
          ],
        },
      ],
      [
        {
          heading: "Maps",
          links: [
            { label: "Map Updates", href: `${G}/maps/updates/automotive/` },
            { label: "Purchase New Maps", href: `${G}/c/road-maps/` },
            { label: "In-Dash Maps", href: "https://auto-oem.garmin.com/landing/site" },
            { label: "Off-Road Maps", href: "https://www.garmin.com/off-road-maps/" },
          ],
        },
        {
          heading: "Accessories & Plans",
          links: [
            { label: "Apps", href: `${G}/c/apps/` },
            { label: "Service Plans", href: `${G}/c/subscription-plans/` },
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
          links: [{ label: "Stealthbox®", href: `${G}/c/automotive/stealthbox-audio/` }],
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
    href: `${G}/c/marine/chartplotters/`,
    columns: [
      [
        {
          heading: "Products",
          links: [
            { label: "Chartplotters & Fishfinders", href: `${G}/c/marine/chartplotters/` },
            { label: "Live Sonar", href: `${G}/c/marine/live-sonar/` },
            { label: "Audio", href: `${G}/c/marine/audio/` },
            { label: "Transducers", href: `${G}/c/marine/boat-sonar-transducers/` },
            { label: "Trolling Motors", href: `${G}/c/marine/trolling-motors/` },
            { label: "Ice Fishing Bundles & Kits", href: `${G}/c/marine/ice-fishing-bundles/` },
            { label: "Radar", href: `${G}/c/marine/boat-radars/` },
            { label: "Autopilots", href: `${G}/c/marine/boat-autopilots/` },
            { label: "Lighting", href: `${G}/c/marine/lighting/` },
            { label: "Handhelds & Smartwatches", href: `${G}/c/marine/handhelds-gps-and-watches/` },
            { label: "VHF & AIS", href: `${G}/c/marine/vhf-ais-marine-radios/` },
            { label: "Sonar Black Boxes", href: `${G}/c/marine/sonar-black-boxes/` },
          ],
        },
      ],
      [
        {
          // The live site renders this continuation group with an empty heading.
          heading: "",
          links: [
            { label: "Antennas & Sensors", href: `${G}/c/marine/boat-sensors-antennas/` },
            { label: "Cameras", href: `${G}/c/marine/boat-cameras/` },
            { label: "Sailing", href: `${G}/c/marine/sailing/` },
            { label: "Digital Switching", href: `${G}/c/marine/digital-switching/` },
            { label: "Engine Cutoff/MOB", href: `${G}/p/1229049/` },
          ],
        },
        {
          heading: "Apps & Plans",
          links: [
            { label: "Apps", href: `${G}/c/marine/marine-apps/` },
            { label: "Service Plans", href: `${G}/c/subscription-plans/` },
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
    href: `${G}/c/aviation/navigation-radios/`,
    columns: [
      [
        {
          heading: "Products",
          links: [
            { label: "Navigation & Radios", href: `${G}/c/aviation/navigation-radios/` },
            { label: "Autopilots", href: `${G}/c/aviation/autopilot-systems/` },
            { label: "Flight Displays & Instruments", href: `${G}/c/aviation/flight-displays-instruments/` },
            { label: "Engine Indication Systems", href: `${G}/aviation/eis-buyers-guide/` },
            { label: "Integrated Flight Decks", href: `${G}/c/aviation/flight-decks/` },
            { label: "Datalinks & Connectivity", href: `${G}/c/aviation/datalinks-connected-cockpit/` },
            { label: "Audio Panels", href: `${G}/c/aviation/audio-panels/` },
            { label: "Weather", href: `${G}/c/aviation/weather-solutions/` },
            { label: "Traffic", href: `${G}/c/aviation/traffic-surveillance-systems/` },
            { label: "ADS-B & Transponders", href: `${G}/aviation/adsb-solutions/` },
            { label: "Portable GPS & Wearables", href: `${G}/c/aviation/gps-wearables-apps/` },
          ],
        },
      ],
      [
        {
          heading: "Markets",
          links: [
            { label: "General Aviation", href: `${G}/c/aviation/general/` },
            { label: "Business Aviation", href: `${G}/c/aviation/business/` },
            { label: "Experimental", href: `${G}/c/aviation/experimental/` },
            { label: "Helicopters", href: `${G}/c/aviation/helicopters/` },
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
    href: `${G}/c/promotions/`,
  },
];

export const takeoverBar = {
  label: "HOLIDAY SALE",
  href: `${G}/c/promotions/holiday-sale-guide-americas/`,
};
