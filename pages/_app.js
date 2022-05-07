import '../styles/globals.css'
import NextNProgress from "nextjs-progressbar";
import "next/app"
import "../styles/xterm.css";


function MyApp({ Component, pageProps }) {
  return (
    <div>
      <NextNProgress options={{ showSpinner: false }}/>
      <Component {...pageProps} />
    </div>
  )
}
export default MyApp
