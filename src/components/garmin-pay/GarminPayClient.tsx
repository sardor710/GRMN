"use client";

import { useState } from "react";

export function GarminPayClient() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <>
      {/* Hero Section */}
      <section
        className="hero"
        style={{ backgroundImage: "url('/minisite/garmin-pay/images/hero.jpg')" }}
        aria-label="Garmin Pay Hero"
      />

      {/* Intro Section */}
      <section id="intro">
        <div className="wrapper">
          <div className="container">
            <h1>Garmin Pay</h1>
            <p>
              Your Garmin device is already an important part of your everyday life, but with the Garmin Pay contactless
              payment solution, you’ll have more uses for it than ever before. It’s the faster, safer, convenient way to
              pay<sup>1</sup>.
            </p>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="btn-black-border btn-size-default"
              href="https://www.garmin.com.sg/products/wearables/?cat=garmin-pay"
            >
              Learn More
            </a>
            <br />
            <img src="/minisite/garmin-pay/images/garmin-pay.jpg" alt="Garmin Pay" />
          </div>
        </div>
      </section>

      {/* Purchases Section */}
      <section className="purchases">
        <div className="wrapper">
          <div className="flex-box row-reverse">
            <div
              className="bg-image"
              style={{ backgroundImage: "url('/minisite/garmin-pay/images/purchases.jpg')" }}
            />
            <div className="text-con">
              <h2 className="app__purchases__copy__title">Pay for Your Purchases</h2>
              <p className="app__purchases__copy__text">
                Garmin Pay is a contactless payment solution designed for people who are always on the move. Whether
                you grab a cup of coffee after your morning run or get a bite to eat while out on a ride, Garmin Pay
                lets you make purchases quickly and almost effortlessly with nothing needed but your watch. No wallet?
                No phone? No problem.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Where It Works Section */}
      <section className="bank light-gray">
        <div className="wrapper">
          <div className="container">
            <img
              className="icon"
              src="/minisite/garmin-pay/images/icon-where-it-works.svg"
              alt="Where It Works"
            />
            <h2>
              Where It Works<sup>1</sup>
            </h2>
            <p>
              Where can you use Garmin Pay? Almost anywhere you can make contactless payments. Keep an eye out for
              participating stores, and check the list of compatible banks and credit cards. More are being added all
              the time.
            </p>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="btn-black-border btn-size-default"
              href="https://www.garmin.com/en-SG/garminpay/banks/"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Transit Section */}
      <section className="transit light-gray">
        <div className="wrapper">
          <div className="container">
            <h2>Transit with Garmin Pay</h2>
            <p>
              Garmin Pay can now be used at select major transit systems around the world. Make your daily commute just
              a little bit smoother by simply tapping to pay per ride with your watch. No transit card, phone or wallet
              is necessary.
            </p>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="btn-black-border btn-size-default"
              href="https://www.garmin.com/en-SG/garminpay/transit/"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Quick and Easy to Use Section */}
      <section className="quick-and-easy">
        <div className="wrapper">
          <div className="container">
            <div className="flex-box">
              <img src="/minisite/garmin-pay/images/quickAndEasy.jpg" alt="Quick and Easy to Use" />
              <div className="text-con">
                <h2>Quick and Easy to Use</h2>
                <p>
                  With just a few quick touches, Garmin Pay is easily accessible from your compatible Garmin watch.
                  Enter your passcode, select the right credit card from your virtual wallet, and then hold your wrist
                  near the card reader — that’s it. No need to fumble for your phone, cards or cash.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy and Security Section */}
      <section className="privacy light-gray">
        <div className="wrapper">
          <div className="container">
            <img
              className="icon"
              src="/minisite/garmin-pay/images/icon-privacy-and-security.svg"
              alt="Privacy and Security"
            />
            <h2>Privacy and Security</h2>
            <p>
              Garmin takes the security of your payment information seriously. That’s why Garmin Pay protects you by
              using watch-specific card numbers and transaction codes every time you make a purchase. And your card
              number is not stored on your device, on our servers or passed to merchants when you pay. So you pay with
              confidence.
            </p>
          </div>
        </div>
      </section>

      {/* Video Section */}
      <section className="video">
        <div className="flex-box row-reverse">
          <div
            className="app__video__player"
            style={{
              backgroundImage: "url('/minisite/garmin-pay/images/maxresdefault.jpg')",
            }}
          >
            {!isPlaying ? (
              <button
                type="button"
                onClick={() => setIsPlaying(true)}
                className="app__video__player__play"
                aria-label="Play video"
                style={{ cursor: "pointer", background: "none", border: "none", padding: 0 }}
              >
                <span>Play</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                  <circle
                    fill="rgba(0,0,0,.4)"
                    stroke="#FFF"
                    strokeWidth="2"
                    strokeMiterlimit="10"
                    cx="49.6"
                    cy="49.4"
                    r="44.4"
                  />
                  <path fill="#FFF" d="M52.4 44.8l9.7 5.6-9.7 5.6-9.8 5.6V39.2" />
                </svg>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsPlaying(false)}
                  className="app__video__player__stop"
                  aria-label="Close video"
                  style={{ border: "none" }}
                >
                  ×
                </button>
                <iframe
                  className="app__video__player__iframe"
                  src="https://www.youtube.com/embed/8B2eJs3RhUE?autoplay=1&rel=0"
                  title="Garmin Pay: A Contactless Payment Solution"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </>
            )}
          </div>
          <div className="text-con">
            <h2>Your Credit Cards, Your Benefits</h2>
            <p>
              With Garmin Pay, you can keep making purchases with the same cards you use every day. Garmin Pay works
              with many major credit and debit cards, including Visa<sup>®</sup> and MasterCard<sup>®</sup>. Just add
              them to your watch’s digital wallet, and then continue taking advantage of the perks and rewards your card
              offers.
            </p>
          </div>
        </div>
      </section>

      {/* Tips for Retailers Section */}
      <section className="retailers-tips">
        <div className="wrapper">
          <div className="flex-box">
            <div
              className="bg-image"
              style={{
                backgroundImage: "url('/minisite/garmin-pay/images/tip-for-banks.jpg')",
                backgroundPosition: "right",
              }}
            />
            <div className="text-con">
              <h2>Tips For Retailers</h2>
              <p className="question">How do I start accepting Garmin Pay in my store?</p>
              <p>
                Depending on your country or region, Garmin Pay works with many major credit and debit cards, including
                Visa and Mastercard. To accept Garmin Pay in your store, you need to have a contactless
                payment-capable terminal. Contact your payment provider so they can set up your terminal, and tell them
                you would like to accept Garmin Pay. To learn more, contact merchant support.
              </p>
              <p>
                Are you a bank and would like to offer Garmin Pay to your customers? Contact us if you have questions.
              </p>
              <p className="question">
                My point-of-sale terminal is already NFC contactless payment-capable. Can I accept Garmin Pay right away?
              </p>
              <p>
                If you accept Visa or MasterCard contactless payments today, you’re likely able to accept Garmin Pay
                for those networks without requiring any changes. If you’re not already accepting contactless payments,
                contact your payment provider to make sure that your point-of-sale setup can accept Garmin Pay, then
                ask them to enable it. To learn more, contact merchant support.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Connect IQ Store Section */}
      <section id="connect-iq" className="connect-iq" style={{ backgroundColor: "#eee" }}>
        <div className="wrapper">
          <div className="container">
            <h2>USE GARMIN PAY IN THE CONNECT IQ STORE</h2>
            <p>
              You can now use Garmin Pay to make online payments in the Connect IQ Store, making it easier than ever to
              buy new watch faces and apps for your devices. Once you&apos;ve added cards through the Garmin Connect app,
              they&apos;ll be stored in your wallet for future payments.
            </p>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="btn-connect-iq btn-black-border btn-size-default"
              href="https://apps.garmin.com/"
              data-ga-title="Garmin Pay - Explore page,Link,Connect IQ Store,Learn More"
            >
              Connect IQ Store
            </a>
          </div>
        </div>
      </section>

      {/* Disclaimers Section */}
      <section className="disclaimers">
        <div className="wrapper">
          <div className="container" style={{ textAlign: "left" }}>
            <p className="app__disclaimer">
              <sup>1</sup>Available for supported cards from participating banks; contact your bank for more
              information. View current supported country, payment network and issuing bank information at{" "}
              <a
                href="https://www.garmin.com/en-US/garminpay/banks/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Garmin.com/GarminPay/banks
              </a>
              .
            </p>
            <p className="app__disclaimer">
              VISA is a registered trademark owned by Visa International Service Association.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
