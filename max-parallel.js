'use strict';

const { DataStream, MultiStream } = require('scramjet');
const Multimeter = require('multimeter');

const MAX_PARALLEL = 3;
const PARALLEL_NON_BLOCKING = true;

(async () => {

    const multi = Multimeter(process);

    const items = Array(10).fill().map((_, i, arr) => ({
        name: `item #${i}`,
        bar: { draw: multi(0, i - arr.length), state: 0 },
        total: Math.ceil(Math.random() * 100),
        progress: 0
    }));

    items.forEach(() => console.log());
    items.forEach(({ name, bar }) => bar.draw.ratio(0, 1, name));

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const makeProgressStream = (item) => {

        return new DataStream({
            maxParallel: 1,
            async promiseRead() {

                await wait(150);

                const delta = Math.ceil(Math.random() * 10);
                const { progress: prevProgress } = item;

                item.progress = Math.min(prevProgress + delta, item.total);

                return Array(item.progress - prevProgress).fill(item);
            }
        });
    };

    await DataStream.from(items)
        .setOptions({
            maxParallel: MAX_PARALLEL
        })
        .use((s) => {

            if (!PARALLEL_NON_BLOCKING) {
                return s.into(
                    async (out, item) => {

                        return await out.pull(makeProgressStream(item));
                    },
                    new DataStream()
                );
            }

            // See https://github.com/signicode/scramjet/issues/25

            const out = new DataStream();

            s.unorder(async (item) => await out.pull(makeProgressStream(item)))
                .run()
                .then(() => out.end());

            return out;
        })
        .each(({ name, bar, total }) => {

            bar.state++;
            bar.draw.ratio(bar.state, total, `${name} ${bar.state} / ${total}`);
        })
        .run();

    multi.destroy();
})();

process.on('unhandledRejection', (err) => {

    throw err;
});
