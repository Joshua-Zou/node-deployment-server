import '../styles/globals.css'
import NextNProgress from "nextjs-progressbar";


function MyApp({ Component, pageProps }) {
  return (
    <div>
      <NextNProgress options={{ showSpinner: false }}/>
      <Component {...pageProps} />
    </div>
  )
}
export default MyApp
