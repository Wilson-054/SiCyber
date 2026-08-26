// Save as: test-concurrency.mjs (taruh di root project, sejajar package.json)

const start = performance.now();

const results = await Promise.all(
  [1, 2, 3, 4, 5].map(async (i) => {
    const t0 = performance.now();
    console.log(`[client] request #${i} dispatched at t=${(t0 - start).toFixed(0)}ms`);
    const res = await fetch(`http://localhost:3000/api/concurrency-test?req=${i}`, {
      cache: "no-store",
    });
    const t1 = performance.now();
    console.log(`[client] request #${i} completed at t=${(t1 - start).toFixed(0)}ms`);
    return res.json();
  })
);

console.log("all done", results);