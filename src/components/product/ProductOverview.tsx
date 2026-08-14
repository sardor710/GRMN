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

interface FeatureCategory {
  category: string;
  items: { title: string; body: string }[];
}

const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    category: "PERFORMANCE FEATURES",
    items: [
      {
        title: "ENDURANCE SCORE",
        body: "Using your VO2 max, training loads and other factors, this feature helps gauge your ability to sustain prolonged effort.",
      },
      {
        title: "VISUAL RACE PREDICTOR",
        body: "Get an estimate of what your pace could be for a 5K, 10K, half-marathon and marathon.",
      },
      {
        title: "PACEPRO™ TECHNOLOGY",
        body: "Plan race-day strategy with GPS-based pace guidance for a selected course or distance.",
      },
      {
        title: "CLIMBPRO FEATURE",
        body: "See real-time information on your current and upcoming climbs on downloaded courses.",
      },
      {
        title: "GRADE-ADJUSTED PACE",
        body: "Get your equivalent running pace at the same effort on flat ground or when ascending.",
      },
      {
        title: "TRAINING READINESS",
        body: "From the moment you wake up, get a readiness score based on your sleep quality, recovery, training load and more, so you can determine whether it's a good day to go hard — or take it easy.",
      },
      {
        title: "TRAINING STATUS",
        body: "Get insights to know if you're training productively, peaking or strained.",
      },
      {
        title: "PERFORMANCE METRICS",
        body: "Gauge your performance with advanced training metrics such as VO2 max, training load and more.",
      },
      {
        title: "AUTOMATIC MULTISPORT TRANSITIONS",
        body: "This feature detects activity changes between swimming, biking and running in multisport activities — so you can focus on racing and let your watch record your splits.",
      },
      {
        title: "WRIST-BASED RUNNING POWER",
        body: "See how much power you’re applying to the trail or road so you can manage effort and fine-tune training.",
      },
    ],
  },
  {
    category: "ACTIVITIES AND FUNCTIONS",
    items: [
      {
        title: "TRACK YOUR ACTIVITIES",
        body: "Use preloaded activity profiles to get data and insight from your active pursuits. You can even track team sports activities like soccer, football, racquet sports and more.",
      },
      {
        title: "RECREATIONAL DIVING",
        body: "A 40-meter dive rating and leakproof metal buttons let you reach new depths with support for scuba and apnea diving activities.",
      },
      {
        title: "HIIT WORKOUTS",
        body: "Track your HIIT workouts, including AMRAP, EMOM, Tabata or custom workouts.",
      },
      {
        title: "ANIMATED WORKOUTS",
        body: "Follow animated cardio, strength, yoga and Pilates workouts on the watch screen.",
      },
      {
        title: "BACKCOUNTRY SKI AND SNOWBOARD",
        body: "Get ascent and descent data along with metrics such as cadence, stride length and grade.",
      },
      {
        title: "XC SKI POWER",
        body: "Measure exercise load when paired with an HRM-Pro™ Plus chest strap (sold separately).",
      },
      {
        title: "SURF ACTIVITY",
        body: "Record waves surfed, maximum speed reached, distance traveled and more. Use Surfline Sessions™ technology to capture video of waves you ride in front of a Surfline camera.",
      },
      {
        title: "MTB DYNAMICS",
        body: "Track the details of your ride with specialized Grit® and Flow™ measurements.",
      },
    ],
  },
  {
    category: "FIND YOUR WAY",
    items: [
      {
        title: "OUTDOOR MAPS+",
        body: "Subscribe to Outdoor Maps+ for premium mapping content, such as satellite imagery and enhanced topographic maps, downloaded directly to your watch.",
      },
      {
        title: "SATIQ™ TECHNOLOGY",
        body: "Get superior positioning accuracy with multi-band GPS while optimizing battery life.",
      },
      {
        title: "ABC SENSORS",
        body: "Navigate your next trail with an altimeter, barometer and 3-axis electronic compass.",
      },
      {
        title: "MULTICONTINENT TOPO MAPS",
        body: "Preloaded TopoActive maps from around the world keep your explorations on track. Download additional maps via Wi-Fi® connectivity.",
      },
      {
        title: "NEXTFORK™ MAP GUIDE",
        body: "Navigate with a quick glance and see the distance to the next intersection and the trail name.",
      },
      {
        title: "UP AHEAD FEATURE",
        body: "Get at-a-glance awareness for selected POI checkpoints ahead — such as aid stations — during a race.",
      },
      {
        title: "TURN-BY-TURN DIRECTIONS",
        body: "Create or find existing courses in the Garmin Connect™ smart-device app, or sync from your favorite third-party platforms and get turn-by-turn directions.",
      },
      {
        title: "SKIVIEW™ MAPS",
        body: "View run names and difficulty ratings for more than 2,000 preloaded ski resorts worldwide.",
      },
      {
        title: "GOLF COURSE MAPS",
        body: "Get preloaded full-color CourseView maps for more than 43,000 golf courses around the world.",
      },
    ],
  },
  {
    category: "HEALTH FEATURES",
    items: [
      {
        title: "MORNING REPORT",
        body: "Get a customizable overview of your sleep, training outlook, HRV status, weather and more as soon as you wake up.",
      },
      {
        title: "HRV STATUS",
        body: "Gain a deeper understanding of your overall health, recovery and training performance through heart rate variability while you sleep.",
      },
      {
        title: "WRIST-BASED HEART RATE",
        body: "The watch constantly samples your heart rate to help you gauge how hard you work during activities.",
      },
      {
        title: "PULSE OX SENSOR",
        body: "Track your blood oxygen saturation while you’re awake or asleep, and gain awareness of how you’re adapting to altitude.",
      },
      {
        title: "SLEEP COACH",
        body: "Get a sleep score and personalized coaching for how much sleep you need and how you can improve. Even track different sleep stages and naps.",
      },
      {
        title: "JET LAG ADVISER",
        body: "Help minimize the effects of jet lag with guidance on light exposure, sleep schedule and exercise.",
      },
      {
        title: "BODY BATTERY™ ENERGY MONITORING",
        body: "Track your body’s energy levels to find the best times for activity and rest.",
      },
      {
        title: "STRESS TRACKING",
        body: "See if you’re having a calm, balanced or stressful day.",
      },
      {
        title: "HEALTH SNAPSHOT™ FEATURE",
        body: "Log a 2-minute session to record key health stats, then generate a report to share with your healthcare provider.",
      },
      {
        title: "RESPIRATION TRACKING",
        body: "See how you’re breathing throughout the day and night.",
      },
      {
        title: "HYDRATION TRACKING",
        body: "Log your daily fluid intake as a reminder to stay hydrated.",
      },
      {
        title: "ALTITUDE AND HEAT ACCLIMATION",
        body: "See how you’re holding up to the current elevation or heat based on your health metrics.",
      },
      {
        title: "WOMEN'S HEALTH TRACKING",
        body: "Track and log your menstrual cycle or pregnancy to get exercise and nutrition education.",
      },
    ],
  },
  {
    category: "CONNECTED FEATURES",
    items: [
      {
        title: "GARMIN CONNECT™ APP",
        body: "See your health and fitness information, connect with friends and more.",
      },
      {
        title: "GARMIN MESSENGER™ APP",
        body: "Communicate via two-way text messaging from your wrist.",
      },
      {
        title: "SMART NOTIFICATIONS",
        body: "Receive emails, texts and alerts on your watch when paired with your iPhone® or Android™ smartphone.",
      },
      {
        title: "MUSIC",
        body: "Download songs and playlists from your Spotify, Deezer or Amazon Music accounts for phone-free listening (subscription may be required).",
      },
      {
        title: "GARMIN PAY™ CONTACTLESS PAYMENTS",
        body: "Breeze through checkout lines or transit systems with participating providers.",
      },
      {
        title: "GARMIN SHARE",
        body: "Use this feature to easily share saved locations, courses and workouts with friends’ compatible Garmin devices.",
      },
      {
        title: "SAFETY AND TRACKING FEATURES",
        body: "If you feel unsafe or if your watch senses that an incident occurred, your watch will send a message with your live location.",
      },
      {
        title: "STOCKS TRACKER",
        body: "Keep track of up to 50 of your favorite stocks — right from your wrist.",
      },
      {
        title: "CONNECT IQ™ STORE",
        body: "Add watch faces, data fields and apps to your paired smartwatch.",
      },
    ],
  },
];

export function ProductOverview({ product: _product }: { product?: ProductDetail }) {
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <div className="-mx-4 space-y-0 text-black">
      {/* 1. Full-Bleed Lifestyle Banners */}
      <section className="space-y-2">
        {LIFESTYLE_BANNERS.map((banner, index) => (
          <div
            key={banner.title}
            className="relative h-[65vw] min-h-[380px] max-h-[750px] w-full overflow-hidden bg-black text-white"
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/40" />

            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <h2 className="g-heading text-[32px] tracking-tight text-white md:text-[54px] lg:text-[64px]">
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
      </section>

      {/* 2. Video Feature Banner */}
      <section className="relative mt-2 h-[55vw] min-h-[360px] max-h-[700px] w-full overflow-hidden bg-neutral-900">
        <Image
          src="/images/products/fenix8/66911-VID-D.jpg"
          alt="fēnix 8 in Action"
          fill
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            aria-label="Play fēnix 8 video"
            className="group flex flex-col items-center gap-3 transition-transform hover:scale-105"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white bg-black/60 shadow-2xl transition-colors group-hover:bg-white">
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
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-2xl text-white hover:bg-black"
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

      {/* 3. Product Lineup Banner */}
      <section className="relative mt-2 h-[45vw] min-h-[300px] max-h-[600px] w-full overflow-hidden bg-neutral-900">
        <Image
          src="/images/products/fenix8/66911-FAN-D.jpg"
          alt="fēnix 8 Family Lineup"
          fill
          sizes="100vw"
          className="object-cover object-center"
        />
      </section>

      {/* 4. Overview Intro Block */}
      <section className="mx-auto max-w-[900px] px-6 py-16 text-center">
        <h2 className="g-heading text-[32px] text-black md:text-[44px]">BE LIMITLESS</h2>
        <p className="mt-4 text-[17px] leading-relaxed text-neutral-700 md:text-[19px]">
          For serious athletes and adventurers who want to push beyond their limits, this premium multisport GPS
          smartwatch is built to perform — with advanced strength training features, dive capability, an internal
          speaker and mic for voice features, a built-in LED flashlight and more.
        </p>
      </section>

      {/* 5. WHAT YOU'LL LOVE Section (6-Card Grid) */}
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
                className="group flex flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-all hover:shadow-md"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-100">
                  <Image
                    src={card.image}
                    alt={card.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
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

      {/* 6. UNLEASH A STRONGER YOU Categorized Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-16 text-center">
            <h2 className="g-heading text-[32px] uppercase tracking-wide text-black md:text-[46px]">
              Unleash a Stronger You
            </h2>
            <p className="mt-2 text-[16px] text-neutral-600">
              Packed with comprehensive tools designed for training, navigation, health and connectivity.
            </p>
          </div>

          <div className="space-y-16">
            {FEATURE_CATEGORIES.map((category) => (
              <div key={category.category} className="border-t border-neutral-200 pt-10">
                <h3 className="g-heading text-[24px] tracking-wide text-black md:text-[30px]">
                  {category.category}
                </h3>
                <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                  {category.items.map((item) => (
                    <div key={item.title} className="rounded border border-neutral-100 bg-neutral-50/50 p-6">
                      <h4 className="text-[16px] font-bold uppercase tracking-[0.05em] text-black">
                        {item.title}
                      </h4>
                      <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">{item.body}</p>
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
