const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    await page.goto('http://localhost:8000');
    
    // Wait for loader to disappear
    await page.waitForSelector('#db-loader', { hidden: true });
    
    // login as demo
    await page.click('#demo-login-btn');
    await page.waitForTimeout(1000); // Wait for redirect to dashboard
    
    // try to click appointments
    const tabs = await page.$$('.tab');
    for (const tab of tabs) {
        const text = await page.evaluate(el => el.textContent, tab);
        if (text.includes('Appointments')) {
            console.log('Clicking Appointments tab...');
            await tab.click();
            break;
        }
    }
    
    await page.waitForTimeout(1000);
    
    await browser.close();
})();
