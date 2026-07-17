import { LearnMore } from "./LearnMore";
import { ScrollVideo } from "./ScrollVideo";
import { ContentSlider } from "./ContentSlider";
import { Disclaimer } from "./Disclaimer";

const B = "/minisite/why-garmin";

/** #life — Lifestyle Convenience feature grid. */
export function LifeSection() {
  return (
    <section id="life">
      <div className="wrapper">
        {/* garmin-pay (full-width) */}
        <div id="garmin-pay" className="flex-box box full-box row-reverse dark scroll-play">
          <div className="video-con">
            <ScrollVideo id="video-garmin-pay" className="side" src={`${B}/video/life-garmin-pay.mp4`} />
          </div>
          <div className="text-con">
            <h2>Leave Your Credit Cards Home, Garmin Got You Covered</h2>
            <LearnMore
              name="Leave Your Credit Cards Home, Garmin Got You Covered"
              title="Leave Your Credit Cards Home, Garmin Got You Covered"
              body="Garmin Pay supports contactless payment with your transit card and Visa/Master Card, allowing you to make purchases without your wallet."
              note="* This feature is only supported by certain watches."
              disclaimer={<Disclaimer kind="see-more" />}
            />
          </div>
        </div>

        <div className="container">
          <div className="flex-box">
            {/* music */}
            <div id="music" className="flex-box box scroll-play">
              <div className="video-con">
                <ScrollVideo id="video-music" className="watch side" src={`${B}/video/life-music.mp4`} />
              </div>
              <div className="text-con">
                <h3>Enjoy Music Without Your Phone</h3>
                <LearnMore
                  name="Enjoy Music Without Your Phone"
                  title="Enjoy Music Without Your Phone"
                  body="You can download songs and playlists to your watch from your computer or a third-party platform for phone-free listening. (requires Bluetooth earphones)"
                  note="* This feature is only supported by certain watches."
                  disclaimer={<Disclaimer kind="see-more" />}
                />
              </div>
            </div>

            {/* smart-notifications */}
            <div id="smart-notifications" className="flex-box box dark">
              <div className="flex-box column">
                <ContentSlider
                  slides={[
                    { content: <img className="screen" src={`${B}/images/life-smart-notifications.png`} alt="" /> },
                    {
                      isVideo: true,
                      content: (
                        <div className="video-con">
                          <video id="video-smart-notifications" className="screen" playsInline muted>
                            <source src={`${B}/video/life-smart-notifications.mp4`} type="video/mp4" />
                          </video>
                        </div>
                      ),
                    },
                  ]}
                />
                <h3>Never Miss Any Important Information</h3>
                <LearnMore
                  name="Never Miss Any Important Information"
                  title="Never Miss Any Important Information"
                  body="Get e-mails, texts and alerts directly on your watch when it's paired with your compatible iPhone or Android smartphone."
                />
              </div>
            </div>
          </div>

          {/* clock */}
          <div id="clock" className="flex-box box row-reverse dark">
            <div
              className="bg-image"
              style={{ backgroundImage: `url('${B}/images/bg-clock.jpg')`, backgroundPosition: "left" }}
            />
            <div className="text-con">
              <h3>Bedfellow-Friendly Alarm</h3>
              <LearnMore
                name="Bedfellow-Friendly Alarm"
                title="Bedfellow-Friendly Alarm"
                body="You can set your alarm to vibration to avoid waking up the person sleeping next to you."
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
