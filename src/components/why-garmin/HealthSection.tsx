import { LearnMore } from "./LearnMore";
import { ScrollVideo } from "./ScrollVideo";
import { ContentSlider } from "./ContentSlider";

const B = "/minisite/why-garmin";

/** #health — Manage Health feature grid. */
export function HealthSection() {
  return (
    <section id="health">
      <div className="wrapper">
        {/* news (full-width) */}
        <div id="news" className="flex-box box full-box row-reverse dark scroll-play">
          <div className="video-con">
            <ScrollVideo id="video-news" src={`${B}/video/health-news.mp4`} />
          </div>
          <div className="text-con">
            <h2>Garmin watches helps you understand your body condition at all times</h2>
            <LearnMore
              name="Garmin watches helps you understand your body condition at all times"
              title="Garmin watches helps you understand your body condition at all times"
              body="It only takes 2 minutes to measure key health data (including heart rate, pulse ox, respiration rate and stress level) and generate a report."
              note="* All models can measure heart rate, respiration rate and stress level. Only some models support Health Snapshot."
            />
          </div>
        </div>

        <div className="container">
          <div className="flex-box">
            {/* sleep */}
            <div id="sleep" className="flex-box box scroll-play">
              <div className="video-con">
                <ScrollVideo id="video-sleep" className="watch side" src={`${B}/video/health-sleep.mp4`} />
              </div>
              <div className="text-con">
                <h3>Analyze Your Sleep to Make It Better</h3>
                <LearnMore
                  name="Analyze Your Sleep to Make It Better"
                  title="Analyze Your Sleep to Make It Better"
                  body="By analyzing your HRV, respiration rate, heartbeats, physical movement and sleep duration, the watch detects your sleep quality during each stage of sleep (light, deep, REM and awake). Complex algorithms also factor in your physiological values during the day and your training data to derive a sleep score with insights."
                />
              </div>
            </div>

            {/* stress */}
            <div id="stress" className="flex-box box dark">
              <div className="flex-box column">
                <ContentSlider
                  slides={[
                    { content: <img className="screen" src={`${B}/images/screen-stress.png`} alt="" /> },
                    { content: <img className="screen" src={`${B}/images/screen-stress-b.png`} alt="" /> },
                  ]}
                />
                <h3>Don&apos;t Let Your Stress Go Off the Chart</h3>
                <LearnMore
                  name="Don't Let Your Stress Go Off the Chart"
                  title="Don't Let Your Stress Go Off the Chart"
                  body="Stress data are calculated using your HRV. Stress level ranges from 0 to 100, with 0-25 suggesting rest, 26-50 representing low stress, 51-75 indicating medium stress and 76-100 showing high stress. It helps you understand your daily stress trends and make necessary adjustments."
                />
              </div>
            </div>
          </div>

          <div className="flex-box">
            {/* body-battery */}
            <div id="body-battery" className="flex-box box dark scroll-play">
              <div className="flex-box column">
                <div className="video-con">
                  <ScrollVideo id="video-body-battery" src={`${B}/video/health-body-battery.mp4`} />
                </div>
                <h3>Avoid Getting Strained</h3>
                <LearnMore
                  name="Avoid Getting Strained"
                  title="Avoid Getting Strained"
                  body="The Body Battery feature works by continuously analyzing combinations of your heart rate, HRV and physical movement and describing how these factors impact your body energy. It allows you to check your energy level at any time to know when your body is charged up and ready for activity or strained and needing a restful sleep."
                />
              </div>
            </div>

            {/* hydration */}
            <div id="hydration" className="flex-box box row-reverse scroll-play">
              <div className="video-con">
                <ScrollVideo id="video-hydration" className="watch" src={`${B}/video/health-hydration.mp4`} />
              </div>
              <div className="text-con">
                <h3>Don&apos;t Forget to Stay Hydrated</h3>
                <LearnMore
                  name="Don't Forget to Stay Hydrated"
                  title="Don't Forget to Stay Hydrated"
                  body="Your Garmin watch will set a default daily hydration goal based on your gender. This goal is derived from the recommendations of several credible health organizations, including the U.S. National Academy of Sciences. You can log your daily water intake directly on your watch to get into the habit of drinking enough liquid every day."
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
