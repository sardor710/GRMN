"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductDetail } from "@/types";

interface LifestyleBanner {
  title: string;
  tagline: string;
  imageDesktop: string;
  imageMobile: string;
}

const LIFESTYLE_BANNERS: LifestyleBanner[] = [
  {
    title: "BE LIMITLESS",
    tagline: "FĒNIX 8",
    imageDesktop: "/images/products/fenix8/66911-1-D.jpg",
    imageMobile: "/images/products/fenix8/66911-1-M.jpg",
  },
  {
    title: "FĒNIX HAS EVOLVED",
    tagline: "BRIGHT AMOLED DISPLAY | DIVE-RATED | SENSOR GUARD",
    imageDesktop: "/images/products/fenix8/66911-2-D.jpg",
    imageMobile: "/images/products/fenix8/66911-2-M.jpg",
  },
  {
    title: "GO BEYOND YOUR CAPABILITIES",
    tagline: "TARGETED STRENGTH TRAINING | BUILT-IN SPEAKER AND MIC",
    imageDesktop: "/images/products/fenix8/66911-3-D.jpg",
    imageMobile: "/images/products/fenix8/66911-3-M.jpg",
  },
  {
    title: "LEAD THE PACK",
    tagline: "ADVANCED TRAINING METRICS | 24/7 HEALTH AND WELLNESS",
    imageDesktop: "/images/products/fenix8/66911-4-D.jpg",
    imageMobile: "/images/products/fenix8/66911-4-M.jpg",
  },
  {
    title: "EXPLORE UNCHARTED TERRITORY",
    tagline: "DYNAMIC ROUND-TRIP ROUTING | TOPO MAPS | LED FLASHLIGHT",
    imageDesktop: "/images/products/fenix8/66911-5-D.jpg",
    imageMobile: "/images/products/fenix8/66911-5-M.jpg",
  },
  {
    title: "NEVER STOP ADVENTURING",
    tagline: "BATTERY LIFE FOR WEEKS",
    imageDesktop: "/images/products/fenix8/66911-6-D.jpg",
    imageMobile: "/images/products/fenix8/66911-6-M.jpg",
  },
];

const WHAT_YOU_LOVE_CARDS = [
  {
    title: "RUGGED BY DESIGN",
    body: "Built to endure, this premium multisport design is dive-rated and features leakproof buttons, a metal sensor guard cover and a bright 1.4\" AMOLED display with scratch-resistant sapphire crystal lens and titanium bezel options.",
    image: "/images/products/fenix8/66911-1.jpg",
  },
  {
    title: "BUILT-IN SPEAKER AND MIC",
    body: "Make and take phone calls from your watch when it’s paired with your smartphone. Plus, control watch features with off-grid voice commands — or use your phone's voice assistant to reply to text messages and more.",
    image: "/images/products/fenix8/66911-2.jpg",
  },
  {
    title: "BUILT-IN LED FLASHLIGHT",
    body: "A truly integrated flashlight with variable light intensities and a red safety light gives you greater awareness in the dark, providing convenient illumination when you need it. Strobe mode can even match your running cadence.",
    image: "/images/products/fenix8/66911-3.jpg",
  },
  {
    title: "ADVANCED STRENGTH TRAINING",
    body: "Elevate your body’s performance with targeted strength training plans and sport-specific workouts for athletes of all kinds — from trail runners and cyclists to surfers and skiers.",
    image: "/images/products/fenix8/1228493-strength_stage.jpg",
  },
  {
    title: "KNOWLEDGE IS POWER",
    body: "Start every day with a customizable morning report offering a summary of health and wellness information. Use the training readiness feature, which looks at a variety of health metrics, to maximize your workout efficiency and recovery.",
    image: "/images/products/fenix8/66911-5.jpg",
  },
  {
    title: "DYNAMIC ROUND-TRIP ROUTING",
    body: "The dynamic round-trip routing feature lets you enter the distance you want to travel and get suggested routes that will guide you back on time. If you detour, it dynamically recalculates to keep you on schedule.",
    image: "/images/products/fenix8/66911-6.jpg",
  },
];

interface FeatureItem {
  title: string;
  icon?: string;
  description: string;
}

interface FeatureCategory {
  category: string;
  items: FeatureItem[];
}

const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    "category": "PERFORMANCE FEATURES",
    "items": [
      {
        "title": "ENDURANCE SCORE",
        "icon": "/images/products/fenix8/icons/ENDURANCE-SCORE.svg",
        "description": "Using your VO2 max, training loads and other factors, this feature helps gauge your ability to sustain prolonged effort."
      },
      {
        "title": "VISUAL RACE PREDICTOR",
        "icon": "/images/products/fenix8/icons/Race-Predictor.svg",
        "description": "Get an estimate of what your pace could be for a 5K, 10K, half-marathon and marathon."
      },
      {
        "title": "COURSE PLANNER",
        "icon": "/images/products/fenix8/icons/COURSE-PLANNER.svg",
        "description": "Prepare for what’s to come with course planner. This feature lets you add cut-off times, notes, rest plans, checkpoints and aid stations to keep you on track throughout the race."
      },
      {
        "title": "PACEPRO™ TECHNOLOGY",
        "icon": "/images/products/fenix8/icons/Dynamic_PacePro.svg",
        "description": "Plan race-day strategy with GPS-based pace guidance for a selected course or distance."
      },
      {
        "title": "CLIMBPRO FEATURE",
        "icon": "/images/products/fenix8/icons/Simulate_Inclines.svg",
        "description": "See real-time information on your current and upcoming climbs on downloaded courses."
      },
      {
        "title": "GRADE-ADJUSTED PACE",
        "icon": "/images/products/fenix8/icons/GRADE-ADJUSTED-PACE.svg",
        "description": "Get your equivalent running pace at the same effort on flat ground or when ascending."
      },
      {
        "title": "TRAINING READINESS",
        "icon": "/images/products/fenix8/icons/TRAINING-READINESS.svg",
        "description": "From the moment you wake up, get a readiness score based on your sleep quality2, recovery, training load and more, so you can determine if it’s a good day to go hard — or take it easy."
      },
      {
        "title": "TRAINING STATUS",
        "icon": "/images/products/fenix8/icons/training-status.svg",
        "description": "Get insight, and know whether you’re training productively, peaking or strained."
      },
      {
        "title": "PERFORMANCE METRICS",
        "icon": "/images/products/fenix8/icons/Measure_Data.svg",
        "description": "Gauge your performance with advanced training metrics such as VO2 max, training load and more."
      },
      {
        "title": "MULTISPORT AUTO TRANSITION",
        "icon": "/images/products/fenix8/icons/LIFESTYLE.svg",
        "description": "This feature detects sport changes between swim, bike and run in multisport activities — so you can focus on the race and let your watch take care of recording splits."
      },
      {
        "title": "HILL SCORE",
        "icon": "/images/products/fenix8/icons/HILL-SCORE.svg",
        "description": "Measure your capability for running uphill, and evaluate your progress over time based on your VO2 max and training history."
      },
      {
        "title": "DAILY SUGGESTED WORKOUTS",
        "icon": "/images/products/fenix8/icons/Workout-Recommendations_Daily-Workout-Suggestions.svg",
        "description": "View your entire week of daily suggested workouts, which adapt after every run or ride."
      },
      {
        "title": "RECOVERY TIME",
        "icon": "/images/products/fenix8/icons/recovery-time.svg",
        "description": "Know how long you need to recover before your next high-effort workout based on your latest training."
      },
      {
        "title": "RACE WIDGET",
        "icon": "/images/products/fenix8/icons/RACE-WIDGET.svg",
        "description": "Prepare for your next race with training tips, personalized daily suggested workouts and more."
      },
      {
        "title": "WRIST-BASED RUNNING DYNAMICS",
        "icon": "/images/products/fenix8/icons/wrist-based-running-dynamics.svg",
        "description": "View crucial running metrics such as cadence, stride length, ground contact time and more."
      },
      {
        "title": "GARMIN COACH",
        "icon": "/images/products/fenix8/icons/Garmin_Coach.svg",
        "description": "Reach your goals with Garmin Coach training plans for running, cycling, strength and fitness; some even adapt based on your health and fitness metrics."
      },
      {
        "title": "RUNNING ECONOMY",
        "icon": "/images/products/fenix8/icons/RUNNING-ECONOMY.svg",
        "description": "Measure your overall energy efficiency while running — using long-term running volume, stride length and step speed loss, which tells you how much you slow down when your foot hits the ground — when you pair your watch with the HRM 600 monitor (sold separately)."
      },
      {
        "title": "RUNNING TOLERANCE",
        "icon": "/images/products/fenix8/icons/RUNNING-TOLERANCE.svg",
        "description": "Better understand the impact each run has on your body, and get a recommended weekly maximum mileage so you can keep training effectively without taking on too much."
      },
      {
        "title": "STEP SPEED LOSS",
        "icon": "/images/products/fenix8/icons/STEP-SPEED-LOSS.svg",
        "description": "Improve your running form and understand how much you slow down when your foot hits the ground — when you pair your watch with the HRM 600 monitor (sold separately)."
      }
    ]
  },
  {
    "category": "ACTIVITIES AND FUNCTIONS",
    "items": [
      {
        "title": "TRACK YOUR ACTIVITIES",
        "icon": "/images/products/fenix8/icons/track-fitness.svg",
        "description": "Use preloaded activity profiles to get data and insight from your active pursuits. Even track team sport activities such as soccer, football, racquet sports and more."
      },
      {
        "title": "RECREATIONAL DIVING",
        "icon": "/images/products/fenix8/icons/Multiple-Dive-Modes.svg",
        "description": "A 40-meter dive rating and leakproof metal buttons let you reach new depths with support for scuba and apnea dive activities."
      },
      {
        "title": "HIIT WORKOUTS",
        "icon": "/images/products/fenix8/icons/HIIT-WORKOUTS.svg",
        "description": "Track your HIIT workouts, including AMRAP, EMOM, Tabata or custom workouts."
      },
      {
        "title": "ANIMATED WORKOUTS",
        "icon": "/images/products/fenix8/icons/On-screen_workouts.svg",
        "description": "Follow animated workouts for cardio, strength, yoga and Pilates on the watch screen."
      },
      {
        "title": "BACKCOUNTRY SKI AND SNOWBOARD",
        "icon": "/images/products/fenix8/icons/ski.svg",
        "description": "Automatically track ascents and descents along with how much time you spend between runs."
      },
      {
        "title": "XC SKI POWER",
        "icon": "/images/products/fenix8/icons/XC-SKI-POWER.svg",
        "description": "Measure exercise load when paired with an HRM-Pro™ Plus chest strap (sold separately)."
      },
      {
        "title": "SURF ACTIVITY",
        "icon": "/images/products/fenix8/icons/surf.svg",
        "description": "Record waves surfed, maximum speed reached, distance traveled and more. Use Surfline Sessions™ technology to capture video of waves you ride in front of a Surfline® camera."
      },
      {
        "title": "MTB DYNAMICS",
        "icon": "/images/products/fenix8/icons/MTB-DYNAMICS---MOUNTAIN-BIKE-DYNAMICS.svg",
        "description": "Track the details of your ride with specialized Grit® and Flow™ measurements."
      },
      {
        "title": "RUCKING ACTIVITY",
        "icon": "/images/products/fenix8/icons/RUCKING-ACTIVITY.svg",
        "description": "A dedicated rucking activity profile allows you to enter pack weight."
      },
      {
        "title": "PACK WEIGHT",
        "icon": "/images/products/fenix8/icons/Weight-Trend.svg",
        "description": "Pack weight considers extra carrying weight during running, hiking and walking activities."
      }
    ]
  },
  {
    "category": "FIND YOUR WAY",
    "items": [
      {
        "title": "OUTDOOR MAPS+",
        "icon": "/images/products/fenix8/icons/Outdoor-Maps.svg",
        "description": "Subscribe to Outdoor Maps+ for premium mapping content, such as satellite imagery and enhanced topographic maps, downloaded directly to your watch."
      },
      {
        "title": "GARMIN TRAILS",
        "icon": "/images/products/fenix8/icons/NEXTFORK-MAP-GUIDE.svg",
        "description": "Access thousands of trails, and send them directly to your compatible device for offline use with a subscription to Garmin Connect+ in the Garmin Connect™ app or to Outdoor Maps+ in the Garmin Explore™ app. Available in select areas. Learn more."
      },
      {
        "title": "SATIQ™ TECHNOLOGY",
        "icon": "/images/products/fenix8/icons/MultiBand.svg",
        "description": "Get superior positioning accuracy with multi-band GPS while optimizing battery life."
      },
      {
        "title": "ABC SENSORS",
        "icon": "/images/products/fenix8/icons/COMPASS.svg",
        "description": "Navigate your next trail with an altimeter, barometer and 3-axis electronic compass."
      },
      {
        "title": "MULTICONTINENT TOPO MAPS",
        "icon": "/images/products/fenix8/icons/GLOBAL.svg",
        "description": "TopoActive maps3 from around the world keep your explorations on track. Download additional maps via Wi-Fi® connectivity."
      },
      {
        "title": "NEXTFORK™ MAP GUIDE",
        "icon": "/images/products/fenix8/icons/NEXTFORK-MAP-GUIDE.svg",
        "description": "Navigate with a quick glance, and see the distance to the next intersection and the trail name."
      },
      {
        "title": "UP AHEAD FEATURE",
        "icon": "/images/products/fenix8/icons/UP-AHEAD.svg",
        "description": "Get at-a-glance awareness for selected POI checkpoints ahead — such as aid stations — during a race."
      },
      {
        "title": "COURSES WITH TURN-BY-TURN DIRECTIONS",
        "icon": "/images/products/fenix8/icons/CREATE-COURSES-AND-SEE-ROAD-SURFACE-TYPE.svg",
        "description": "Create or find existing courses in the Garmin Connect™ smart-device app, or sync from your favorite third-party platforms and get turn-by-turn directions."
      },
      {
        "title": "SKIVIEW™ MAPS",
        "icon": "/images/products/fenix8/icons/SKIVIEW-MAPS.svg",
        "description": "View run names and difficulty ratings for more than 2,000 preloaded ski resorts worldwide."
      },
      {
        "title": "GOLF COURSE MAPS",
        "icon": "/images/products/fenix8/icons/full-color-courseview-maps-tee-hero.svg",
        "description": "Get preloaded full-color CourseView maps for more than 43,000 golf courses around the world."
      }
    ]
  },
  {
    "category": "HEALTH FEATURES",
    "items": [
      {
        "title": "MORNING REPORT",
        "icon": "/images/products/fenix8/icons/MORNING-REPORT.svg",
        "description": "Get a customizable overview of your sleep, training outlook, HRV status, weather and more as soon as you wake up."
      },
      {
        "title": "EVENING REPORT",
        "icon": "/images/products/fenix8/icons/EVENING-REPORT.svg",
        "description": "Prepare for tomorrow before bed with a reminder of sleep need, tomorrow’s workout, weather and events."
      },
      {
        "title": "HRV STATUS",
        "icon": "/images/products/fenix8/icons/HRV-STATUS.svg",
        "description": "Gain a better understanding of your overall health, recovery and training performance while you sleep."
      },
      {
        "title": "WRIST-BASED HEART RATE",
        "icon": "/images/products/fenix8/icons/WristHeartRate.svg",
        "description": "The watch constantly samples your heart rate2 to help you gauge how hard you work during activities."
      },
      {
        "title": "GARMIN ECG APP",
        "icon": "/images/products/fenix8/icons/30-Second-Recording.svg",
        "description": "The ECG app4 uses sensors to record the electrical signals that control how your heart beats. It analyzes that recording to detect signs of an irregular heart rhythm called atrial fibrillation (AFib)."
      },
      {
        "title": "PULSE OX SENSOR",
        "icon": "/images/products/fenix8/icons/Pulseox.svg",
        "description": "Track your blood oxygen saturation while you’re awake or asleep, and gain awareness of how you’re adapting to altitude5."
      },
      {
        "title": "SLEEP COACH",
        "icon": "/images/products/fenix8/icons/SLEEP-COACH.svg",
        "description": "Get a sleep score and personalized coaching for how much sleep you need. Track sleep stages, and get insights to improve sleep quality2."
      },
      {
        "title": "BREATHING VARIATIONS",
        "icon": "/images/products/fenix8/icons/BREATHING-VARIATIONS-THROUGHOUT-THE-NIGHT.svg",
        "description": "For a closer glimpse of your health, the breathing variations feature helps you understand shifts in your breathing patterns as you sleep6. These shifts could be related to environment, alcohol, or potential sleep disorders such as sleep apnea."
      },
      {
        "title": "LIFESTYLE LOGGING",
        "icon": "/images/products/fenix8/icons/Report.svg",
        "description": "Log behaviors — such as caffeine and alcohol intake — and view reports on how they impact your health in the Garmin Connect™ app."
      },
      {
        "title": "NUTRITION IN THE GARMIN CONNECT<sup>™</sup> APP",
        "icon": "/images/products/fenix8/icons/NUTRITION-IN-GARMIN-CONNECT.svg",
        "description": "Easily track calories and macronutrients, get personalized nutrition recommendations and see reports to follow your progress toward your goals with a Garmin Connect+ plan."
      },
      {
        "title": "NAP DETECTION",
        "icon": "/images/products/fenix8/icons/Nap-Detection.svg",
        "description": "Automatically track or log your naps to see how they benefit your body and to check the recommended time and duration they should be."
      },
      {
        "title": "JET LAG ADVISER",
        "icon": "/images/products/fenix8/icons/jet-lag-advisor.svg",
        "description": "Help to minimize the effects of jet lag with guidance on light exposure, sleep schedule and exercise."
      },
      {
        "title": "HEALTH STATUS",
        "icon": "/images/products/fenix8/icons/health-status.svg",
        "description": "Look for changes in your health data that could indicate added stress to your body, so you can know when you’re trending away from your usual range."
      },
      {
        "title": "BODY BATTERY™ ENERGY MONITORING",
        "icon": "/images/products/fenix8/icons/BodyBattery.svg",
        "description": "Track your body’s energy levels to find the best times for activity and rest2."
      },
      {
        "title": "STRESS TRACKING",
        "icon": "/images/products/fenix8/icons/Health_And_Fitness_Tracking.svg",
        "description": "See if you’re having a calm, balanced or stressful day."
      },
      {
        "title": "HEALTH SNAPSHOT™ FEATURE",
        "icon": "/images/products/fenix8/icons/health-snapshot.svg",
        "description": "Log a 2-minute session to record key health stats, then generate a report to share with your health care provider."
      },
      {
        "title": "RESPIRATION TRACKING",
        "icon": "/images/products/fenix8/icons/respiration.svg",
        "description": "See how you’re breathing throughout the day and night."
      },
      {
        "title": "HYDRATION TRACKING",
        "icon": "/images/products/fenix8/icons/hyrdation.svg",
        "description": "Log your daily fluid intake as a reminder to stay hydrated."
      },
      {
        "title": "ALTITUDE AND HEAT ACCLIMATION",
        "icon": "/images/products/fenix8/icons/HEAT-AND-ALTITUDE-ACCLIMATION.svg",
        "description": "See how you’re holding up to the current elevation or heat based on your health metrics."
      },
      {
        "title": "WOMEN’S HEALTH TRACKING",
        "icon": "/images/products/fenix8/icons/MCT.svg",
        "description": "Track your menstrual cycle or pregnancy, plus get exercise and nutrition education. With skin temperature tracking while you sleep, you can get improved period predictions and past ovulation estimates7."
      },
      {
        "title": "NATURAL CYCLES° COMPATIBILITY",
        "icon": "/images/products/fenix8/icons/Natural-Cycle.svg",
        "description": "Unlock deeper fertility insights when you sync your skin temperature data with the FDA-cleared Natural Cycles birth control app12 (Natural Cycles subscription required)."
      },
      {
        "title": "SMART WAKE ALARM",
        "icon": "/images/products/fenix8/icons/ON-DEVICE-BIKE-BELL.svg",
        "description": "Wake up more refreshed. Smart wake alarm can gently vibrate to wake you at the right time."
      },
      {
        "title": "MOBILITY",
        "icon": "/images/products/fenix8/icons/MOVE-ALERTS.svg",
        "description": "Increase your flexibility and strength with new downloadable mobility workouts available for free in the Garmin Connect™ app and an activity profile."
      }
    ]
  },
  {
    "category": "CONNECTED FEATURES",
    "items": [
      {
        "title": "GARMIN CONNECT APP",
        "icon": "/images/products/fenix8/icons/Garmin_Connect.svg",
        "description": "See your health and fitness information, connect with friends and more."
      },
      {
        "title": "GARMIN MESSENGER™ APP",
        "icon": "/images/products/fenix8/icons/GARMIN-MESSENGER-APP.svg",
        "description": "Communicate via two-way text messaging8 on your wrist."
      },
      {
        "title": "SMART NOTIFICATIONS",
        "icon": "/images/products/fenix8/icons/Messaging.svg",
        "description": "Receive emails, texts and alerts on your smartwatch when paired with your iPhone® or Android™ smartphone."
      },
      {
        "title": "WORKS WITH WHATSAPP",
        "icon": "/images/products/fenix8/icons/WhatsApp.svg",
        "description": "Stay up to date on WhatsApp while keeping your phone in your pocket. Read, reply and react to your messages right from your watch11. The app is available in the Connect IQ Store."
      },
      {
        "title": "MUSIC",
        "icon": "/images/products/fenix8/icons/Music.svg",
        "description": "Download songs and playlists from your Spotify, Deezer, Amazon Music or YouTube® Music accounts for phone-free listening (subscription may be required)."
      },
      {
        "title": "GARMIN PAY™ CONTACTLESS PAYMENTS",
        "icon": "/images/products/fenix8/icons/Garmin_Pay.svg",
        "description": "Breeze through checkout lines or transit systems with participating providers."
      },
      {
        "title": "GARMIN SHARE",
        "icon": "/images/products/fenix8/icons/Share.svg",
        "description": "Use this feature to easily share saved locations, courses and workouts with friends’ compatible Garmin devices."
      },
      {
        "title": "SAFETY AND TRACKING FEATURES",
        "icon": "/images/products/fenix8/icons/assistance.svg",
        "description": "If you feel unsafe or if your watch senses that an incident occurred, your watch will send a message with your live location9."
      },
      {
        "title": "STOCKS TRACKER",
        "icon": "/images/products/fenix8/icons/stocks.svg",
        "description": "Keep track of up to 50 of your favorite stocks10 — right from your wrist."
      },
      {
        "title": "SPORTS SCORES",
        "icon": "/images/products/fenix8/icons/sports-score.svg",
        "description": "Live data, schedules and standings for 15 different sports leagues when paired to your smartphone."
      },
      {
        "title": "CONNECT IQ™ STORE",
        "icon": "/images/products/fenix8/icons/CONNECT-IQ-STORE.svg",
        "description": "Add watch faces, data fields and apps from your paired smartphone."
      },
      {
        "title": "POWER MANAGER",
        "icon": "/images/products/fenix8/icons/power-manager.svg",
        "description": "View how various settings and sensors impact your watch’s battery life."
      }
    ]
  }
];

export function ProductOverview({ product: _product }: { product?: ProductDetail }) {
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <div className="w-full text-black">
      {/* 1. Full-Bleed Lifestyle Banners - 0px gap, uncropped, full width */}
      <section className="flex flex-col p-0 m-0">
        {LIFESTYLE_BANNERS.map((banner, index) => (
          <div
            key={banner.title}
            className="relative w-full aspect-[16/9] min-h-[300px] overflow-hidden bg-black text-white"
          >
            <Image
              src={banner.imageDesktop}
              alt={banner.title}
              fill
              priority={index === 0}
              sizes="100vw"
              className="object-cover object-center"
            />
            {/* Subtle Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <h2 className="g-heading text-[32px] tracking-tight text-white md:text-[54px] lg:text-[68px]">
                {banner.title}
              </h2>
              {banner.tagline && (
                <div className="mt-4 inline-block bg-black/75 px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white backdrop-blur-sm md:text-[14px]">
                  {banner.tagline}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* 2. Video Feature Banner - 0 gap */}
        <div className="relative w-full aspect-[16/9] min-h-[300px] overflow-hidden bg-neutral-900">
          <Image
            src="/images/products/fenix8/66911-VID-D.jpg"
            alt="fēnix 8 in Action"
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/25" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              aria-label="Play fēnix 8 video"
              className="flex flex-col items-center gap-3 cursor-pointer"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white bg-black/60 shadow-2xl transition-colors hover:bg-white hover:text-black group">
                <svg
                  className="h-8 w-8 translate-x-0.5 fill-white transition-colors group-hover:fill-black"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <span className="text-[13px] font-bold uppercase tracking-[0.1em] text-white drop-shadow">
                Watch the Video
              </span>
            </button>
          </div>
        </div>

        {/* 3. Product Lineup Banner - 0 gap */}
        <div className="relative w-full aspect-[16/9] min-h-[260px] overflow-hidden bg-neutral-900">
          <Image
            src="/images/products/fenix8/66911-FAN-D.jpg"
            alt="fēnix 8 Family Lineup"
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
      </section>

      {/* Video Modal */}
      {videoOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <div className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-lg bg-black shadow-2xl">
            <button
              onClick={() => setVideoOpen(false)}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-2xl text-white hover:bg-black cursor-pointer"
              aria-label="Close video"
            >
              ×
            </button>
            <iframe
              className="h-full w-full"
              src="https://www.youtube.com/embed/kYm0K5G2_5Q?autoplay=1&rel=0"
              title="Garmin fēnix 8 Overview"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* 4. Overview Intro Block */}
      <section className="mx-auto max-w-[900px] px-6 py-16 text-center">
        <h2 className="g-heading text-[32px] text-black md:text-[44px]">BE LIMITLESS</h2>
        <p className="mt-4 text-[17px] leading-relaxed text-neutral-700 md:text-[19px]">
          For serious athletes and adventurers who want to push beyond their limits, this premium multisport GPS
          smartwatch is built to perform — with advanced strength training features, dive capability, an internal
          speaker and mic for voice features, a built-in LED flashlight and more.
        </p>
      </section>

      {/* 5. WHAT YOU'LL LOVE Section (6-Card Grid - Static, No Zoom Animations) */}
      <section className="bg-neutral-50 px-6 py-16">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-12 text-center">
            <h2 className="g-heading text-[28px] uppercase tracking-wide text-black md:text-[40px]">
              What You&apos;ll Love
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {WHAT_YOU_LOVE_CARDS.map((card) => (
              <div
                key={card.title}
                className="flex flex-col overflow-hidden rounded-lg bg-white shadow-sm border border-neutral-200"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-100">
                  <Image
                    src={card.image}
                    alt={card.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="g-heading text-[20px] text-black md:text-[22px]">{card.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">{card.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. UNLEASH A STRONGER YOU Categorized 5-Column Feature Grid with Vector Icons matching reference */}
      <section className="px-6 py-20 bg-white">
        <div className="mx-auto max-w-[1360px]">
          <div className="mb-16 text-center">
            <h2 className="g-heading text-[32px] uppercase tracking-wide text-black md:text-[46px]">
              Unleash a Stronger You
            </h2>
            <p className="mt-2 text-[16px] text-neutral-600">
              Packed with comprehensive tools designed for training, navigation, health and connectivity.
            </p>
          </div>

          <div className="space-y-20">
            {FEATURE_CATEGORIES.map((cat) => (
              <div key={cat.category} className="space-y-8">
                {/* Category Header with Divider Rule */}
                <div>
                  <h3 className="g-heading text-[22px] font-bold uppercase tracking-wider text-black md:text-[26px]">
                    {cat.category}
                  </h3>
                  <div className="mt-3 h-[1px] w-full bg-neutral-300" />
                </div>

                {/* 5-Column Grid on Desktop, 2-3 on Mobile/Tablet */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {cat.items.map((item) => (
                    <div
                      key={item.title}
                      className="flex flex-col items-center text-center"
                    >
                      {/* SVG Line Icon */}
                      {item.icon ? (
                        <div className="relative mb-4 flex h-14 w-14 items-center justify-center">
                          <Image
                            src={item.icon}
                            alt={item.title}
                            width={52}
                            height={52}
                            className="h-12 w-12 object-contain"
                          />
                        </div>
                      ) : (
                        <div className="mb-4 h-14 w-14" />
                      )}

                      {/* Feature Title */}
                      <h4 className="text-[13px] font-bold uppercase tracking-[0.05em] text-black leading-tight">
                        {item.title}
                      </h4>

                      {/* Feature Description */}
                      {item.description && (
                        <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
                          {item.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Disclaimers & Footnotes */}
      <section className="border-t border-neutral-200 bg-neutral-100 px-6 py-12 text-[13px] leading-relaxed text-neutral-600">
        <div className="mx-auto max-w-[1280px] space-y-2">
          <p>
            <sup>1</sup> Activity tracking accuracy.
          </p>
          <p>
            <sup>2</sup> When paired with your compatible smartphone. For safety and tracking features requirements and
            limitations, see Garmin.com/safety.
          </p>
          <p>
            <sup>3</sup> This is not a medical device and is not intended for use in the diagnosis or monitoring of any
            medical condition; see Garmin.com/ataccuracy. Pulse Ox not available in all countries.
          </p>
          <p>
            <sup>4</sup> View current supported country, payment network and issuing bank information at
            Garmin.com/garminpay/banks.
          </p>
          <p>
            SPOTIFY and the Spotify logo are among the registered trademarks of Spotify AB. Amazon Music and all
            related logos are trademarks of Amazon.com, Inc. or its affiliates. Apple® and iPhone® are trademarks of
            Apple Inc., registered in the U.S. and other countries. Android is a trademark of Google LLC.
          </p>
        </div>
      </section>
    </div>
  );
}
