# A token bucket in one picture

A token bucket lets a client send **bursts up to the bucket's capacity**, then holds it to the refill rate. This one holds 10 tokens and gets one back per second.

## A burst of 12 requests

<figure class="anim" data-animation="bucket"><figcaption>12 requests against a bucket of 10.</figcaption></figure>

Each request takes one token. The first 10 find one and pass; requests 11 and 12 find the bucket empty and are rejected (an HTTP API would answer `429 Too Many Requests`). A second later one token is back, so exactly one more request can pass.

The capacity sets the largest burst; the refill rate sets the sustained throughput. A client that waits for the refill never sees a rejection.
