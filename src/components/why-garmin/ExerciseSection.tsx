import { LearnMore } from "./LearnMore";
import { ScrollVideo } from "./ScrollVideo";
import { ContentSlider } from "./ContentSlider";
import { Disclaimer } from "./Disclaimer";

const B = "/minisite/why-garmin";

/** #exercise — Get Into Sports feature grid. */
export function ExerciseSection() {
  return (
    <section id="exercise">
      <div className="wrapper">
        {/* sports (full-width) */}
        <div id="sports" className="flex-box box full-box dark scroll-play">
          <div className="video-con">
            <ScrollVideo id="video-sports" src={`${B}/video/exercise-sports.mp4`} />
          </div>
          <div className="text-con">
            <h2>No Matter How You Move, Garmin Moves with You</h2>
            <LearnMore
              name="No Matter How You Move, Garmin Moves with You"
              title="No Matter How You Move, Garmin Moves with You"
              body="With various built-in outdoor and indoor sports apps, including walking, running, cycling and pool swimming, it tracks every way you move."
            />
          </div>
        </div>

        <div className="container">
          {/* daily-workout */}
          <div id="daily-workout" className="flex-box box row-reverse dark">
            <ContentSlider
              slides={[
                {
                  isVideo: true,
                  content: (
                    <div className="video-con">
                      <video id="video-suggestion" className="screen" playsInline muted>
                        <source src={`${B}/video/exercise-suggestion.mp4`} type="video/mp4" />
                      </video>
                    </div>
                  ),
                },
                { content: <img className="screen" src={`${B}/images/screen-coach.png`} alt="" /> },
                { content: <img className="screen" src={`${B}/images/screen-recovery.png`} alt="" /> },
              ]}
            />
            <div className="text-con">
              <h3>Move and Rest, Let Garmin Plan for You</h3>
              <LearnMore
                name="Move and Rest, Let Garmin Plan for You"
                title="Move and Rest, Let Garmin Plan for You"
                body="Garmin Coach provides you with free professional training programs for your 5k, 10k or half-marathon pace and training plans tailored to your goals. After each run, the system adjusts its training suggestions based on your performance, recovery status and upcoming events in your Garmin Connect Calendar."
                note="* This feature is only supported by certain watches."
                disclaimer={<Disclaimer kind="see-more" />}
              />
            </div>
          </div>

          <div className="flex-box">
            {/* training */}
            <div id="training" className="flex-box box">
              <div className="flex-box column">
                <ContentSlider
                  slides={[
                    { content: <img className="screen" src={`${B}/images/screen-training-status.png`} alt="" /> },
                    { content: <img className="screen" src={`${B}/images/screen-training-effect.png`} alt="" /> },
                  ]}
                />
                <h3>Grasp Your Training Effectiveness</h3>
                <LearnMore
                  name="Grasp Your Training Effectiveness"
                  title="Grasp Your Training Effectiveness"
                  body="With a more powerful analytical tool, the watch determines if you're training productively, peaking or overreaching. These analyses are based on your performance metrics such as your recent activities and HRV status."
                  note="* This feature is only supported by certain watches."
                  disclaimer={<Disclaimer kind="see-more" />}
                />
              </div>
            </div>

            {/* gps */}
            <div id="gps" className="flex-box box dark scroll-play">
              <div className="flex-box column">
                <div className="video-con">
                  <ScrollVideo id="video-gps" src={`${B}/video/exercise-gps.mp4`} />
                </div>
                <h3>Flex Your Activity Tracks</h3>
                <LearnMore
                  name="Flex Your Activity Tracks"
                  title="Flex Your Activity Tracks"
                  body="With precise positioning capabilities, the watch offers significantly improved positioning speed and accuracy even in challenging environments such as high mountains or urban areas with tall buildings."
                />
              </div>
            </div>
          </div>

          <div className="flex-box">
            {/* battery */}
            <div id="battery" className="flex-box box dark scroll-play">
              <div className="bg-image" style={{ backgroundImage: `url('${B}/images/bg-solar.jpg')` }} />
              <div className="battery-video-con">
                <div className="video-con">
                  <img className="watch" src={`${B}/images/exercise-battery.png`} alt="" />
                  <ScrollVideo id="video-battery" src={`${B}/video/exercise-battery.mp4`} />
                </div>
              </div>
              <div className="text-con">
                <h3>No More Running Out of Battery</h3>
                <LearnMore
                  name="No More Running Out of Battery"
                  title="No More Running Out of Battery"
                  body="With solar charging in 3 hours of direct sunlight (50,000 lux) per day, you can extend your battery life in smartwatch mode."
                  note="* This feature is only supported by certain watches."
                  disclaimer={<Disclaimer kind="find-watch" />}
                />
              </div>
            </div>

            {/* waterproof */}
            <div id="waterproof" className="flex-box box dark">
              <div
                className="bg-image"
                style={{ backgroundImage: `url('${B}/images/exercise-waterproof.jpg')` }}
              />
              <div className="text-con">
                <h3>Works Perfectly Under Water</h3>
                <LearnMore
                  name="Works Perfectly Under Water"
                  title="Works Perfectly Under Water"
                  body="Traditional buttons allow you to operate your watch with buttons when you're under water, dealing with sweat on the display or wearing gloves."
                />
              </div>
            </div>
          </div>

          {/* flashlight */}
          <div id="flashlight" className="flex-box box row-reverse dark scroll-play">
            <div className="video-con">
              <ScrollVideo id="video-flashlight" src={`${B}/video/exercise-flashlight.mp4`} />
            </div>
            <div className="text-con">
              <h3>Move in the Dark</h3>
              <LearnMore
                name="Move in the Dark"
                title="Move in the Dark"
                body="The built-in LED flashlight features variable light intensities and a red or green safety light, allowing you to train in the dark with awareness and providing convenient illumination when you need it. Strobe mode can even match your cadence."
                note="* This feature is only supported by certain watches."
                disclaimer={<Disclaimer kind="find-watch" />}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
