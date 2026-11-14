import { display as atelier } from "./designs/atelier/fonts";
import { display as gridline } from "./designs/gridline/fonts";
import { display as margin } from "./designs/margin/fonts";
import { display as mercury } from "./designs/mercury/fonts";
import { display as orbit } from "./designs/orbit/fonts";
import { display as shortlist } from "./designs/shortlist/fonts";
import { display as reeded } from "./designs/reeded/fonts";
import { display as console } from "./designs/console/fonts";
import { display as sift } from "./designs/sift/fonts";
import { display as velocity } from "./designs/velocity/fonts";
import { display as lumen } from "./designs/lumen/fonts";
import { display as halo } from "./designs/halo/fonts";
import { display as plinth } from "./designs/plinth/fonts";
import { display as vista } from "./designs/vista/fonts";
import { display as fold } from "./designs/fold/fonts";
import { display as stack } from "./designs/stack/fonts";
import { display as graph } from "./designs/graph/fonts";
import { display as query } from "./designs/query/fonts";
import { display as radar } from "./designs/radar/fonts";
import { display as launch } from "./designs/launch/fonts";

/** Display-font class names, so the overview shows each design's name in its own type. */
export const designFonts: Record<string, string> = {
  orbit: orbit.className,
  margin: margin.className,
  shortlist: shortlist.className,
  atelier: atelier.className,
  gridline: gridline.className,
  mercury: mercury.className,
  reeded: reeded.className,
  console: console.className,
  sift: sift.className,
  velocity: velocity.className,
  lumen: lumen.className,
  halo: halo.className,
  plinth: plinth.className,
  vista: vista.className,
  fold: fold.className,
  stack: stack.className,
  graph: graph.className,
  query: query.className,
  radar: radar.className,
  launch: launch.className,
};
