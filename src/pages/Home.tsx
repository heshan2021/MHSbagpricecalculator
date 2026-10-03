/* MHS Bag Price Calculator - start page (the two-card chooser).
   Legacy index.html markup, unchanged except that the calculator link now points at the built
   page name. */

export function Home() {
  return (
    <div className="wrap">
        <div className="top">
            <div className="mark" aria-hidden="true">&#127811;</div>
            <div>
                <h1>MHS Bag Price Calculator</h1>
                <p>Non-woven bag quotations · two pages, one rate card</p>
            </div>
        </div>

        <div className="cards">
            <a className="card" href="./calculator.html">
                <div className="icon" aria-hidden="true">&#128200;</div>
                <h2>Price calculator</h2>
                <p>Pick a bag, set the quantity and quote instantly. The price per bag follows the order size automatically.</p>
                <span className="tag">For sales staff and customers</span>
            </a>
            <a className="card" href="./admin.html">
                <div className="icon" aria-hidden="true">&#128274;</div>
                <h2>Rate control</h2>
                <p>All bag costs, the percentage markup bands and the quotation defaults in one editable table. Password protected.</p>
                <span className="tag">Administrators only</span>
            </a>
        </div>

        <footer>
            <p>Started with <code>Start Server.cmd</code> (or <code>node serve.js</code>)? Then <code>/</code> opens the calculator
            straight away and the dashboard lives at <code>/admin</code>. This chooser is what you see when you open
            <code>index.html</code> directly or serve the folder with Python / Live Server.</p>
        </footer>
    </div>
  );
}
