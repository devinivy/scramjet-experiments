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
        return DataStream
            .from(function* () {
                while (item.progress < item.total) {
                    const delta = Math.ceil(Math.random() * 10);
                    const { progress: prevProgress } = item;
                    
                    item.progress = Math.min(prevProgress + delta, item.total);
                    
                    yield new Promise(async res => {
                        await wait(150);
                        res(Object.assign({}, item));
                    });
                }
            })
            .setOptions({maxParallel: 1});
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

            // Snippet below originally described in https://github.com/signicode/scramjet/issues/25

            const out = new DataStream();

            s.unorder(async (item) => {
                const str = makeProgressStream(item);
                process.stdout.write(`                                                               111 ${item.name} \r`)

                await out.pull(str); // this keeps the backpressure
                process.stdout.write(`                                            333 ${item.name} \r`)
            }).setOptions({maxParallel: MAX_PARALLEL}).run().then(
                () => out.end()
            );

            return out;
        })
        .each(({ name, bar, progress, total }) => {
            bar.state = progress;
            bar.draw.ratio(bar.state, total, `${name} ${progress} / ${total}`);
        })
        .run();

    multi.destroy();
})();

process.on('unhandledRejection', (err) => {

    throw err;
});
