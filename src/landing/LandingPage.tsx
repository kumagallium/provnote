import { Header } from "./sections/Header";
import { Hero } from "./sections/Hero";
import { Problem } from "./sections/Problem";
import { Pillars } from "./sections/Pillars";
import { Trust } from "./sections/Trust";
import { ForEveryone } from "./sections/ForEveryone";
import { GetStarted } from "./sections/GetStarted";
import { Footer } from "./sections/Footer";

export function LandingPage() {
  return (
    <div className="lp-root">
      <Header />
      <main>
        <Hero />
        <Problem />
        <Pillars />
        <Trust />
        <ForEveryone />
        <GetStarted />
      </main>
      <Footer />
    </div>
  );
}
