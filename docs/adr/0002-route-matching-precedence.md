# Route matching precedence

Route matching follows Next.js-style precedence: static segments, then `[param]`, then catch-all `[...param]`, then optional catch-all `[[...param]]`. Route groups `(name)` consume no URL segment.

The resolver collects every matching route and ranks matches by per-segment specificity instead of returning the first filesystem match. A first-match walk would let a route group containing a dynamic route outrank a root static route, because groups are traversed without consuming a segment. Collecting and ranking keeps precedence global. Ambiguous routes with equal specificity resolve deterministically by directory name order. Consequence: each request may traverse more of the route tree than a first-match walk.
