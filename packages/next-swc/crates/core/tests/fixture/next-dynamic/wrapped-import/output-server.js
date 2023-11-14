import { __nextjs_pure } from 'next/dist/build/swc/helpers';
import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(async ()=>{
    process.env.NEXT_RUNTIME !== "edge" && __nextjs_pure(()=>handleImport(import('./components/hello')));
}, {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "./components/hello"
        ]
    },
    loading: ()=>null,
    ssr: false
});
