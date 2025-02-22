const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs').promises;
const playSound = require('play-sound');
const { exec } = require('child_process');

// Configurations
const LOGIN_URL = 'https://cloud.nodeverse.ai';
const VERIFY_URL = 'https://cloud.nodeverse.ai/verify-token';
const REFRESH_INTERVAL = 180000; // 3 minutes
const drivers = [];

// Custom logger with timestamp and account info
function createLogger(username) {
    return {
        info: (message) => console.log(`[${new Date().toISOString()}] [${username}] ${message}`),
        error: (message) => console.error(`[${new Date().toISOString()}] [${username}] ERROR: ${message}`)
    };
}

async function readAccounts() {
    try {
        const data = await fs.readFile('accounts.txt', 'utf8');
        return data.split('\n').filter(line => line.trim()).map(line => {
            const [username, password] = line.split(':');
            return { username: username.trim(), password: password.trim() };
        });
    } catch (error) {
        console.error('Error reading accounts file:', error);
        process.exit(1);
    }
}

async function setupDriver() {
    const options = new chrome.Options();
    // options.addArguments('--headless'); // Uncomment for headless mode
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();
    drivers.push(driver);
    return driver;
}

async function login(driver, account, logger) {
    try {
        logger.info('Navigating to login page');
        await driver.get(LOGIN_URL);

        logger.info('Entering credentials');
        await driver.findElement(By.css('#email')).sendKeys(account.username);
        await driver.findElement(By.css('#password')).sendKeys(account.password);
        await driver.sleep(1000);
        logger.info('Submitting login form');
        await driver.findElement(By.css('#__next > main > div > div.ant-layout.ant-layout-has-sider.sc-gEVAOR.kNNTpX.css-1tijx3l > div > main > div > div:nth-child(3) > form > div > div.ant-col.ant-col-24.sc-NySBO.jTyCwB.css-1tijx3l > button')).click();

        logger.info('Waiting for login result');
        await driver.sleep(3000);

        // Check login success
        const successElement = await driver.findElements(By.css('#__next > main > div > div.ant-layout.ant-layout-has-sider.sc-gEVAOR.kNNTpX.css-1tijx3l > div > main > div > div.sc-cdmUDc.cHAPxv > h1.sc-eQKIrX.cYMhQ'));
        if (successElement.length > 0) {
            logger.info('Login successful');
            return true;
        }
        
        logger.error('Login failed');
        return false;
    } catch (error) {
        logger.error(`Login process failed: ${error.message}`);
        return false;
    }
}

async function monitorVerification(driver, logger) {
    try {
        logger.info('Navigating to verification page');
        await driver.get(VERIFY_URL);

        const checkForData = async () => {
            try {
                await driver.sleep(2222);
                const noDataElement = await driver.findElements(By.css('#__next > main > div > div.ant-layout.ant-layout-has-sider.sc-gEVAOR.kNNTpX.css-1tijx3l > div > main > div > div.ant-table-wrapper.styled__StyledTable-sc-o32uzm-0.giInEQ.css-1tijx3l > div > div > div > div > div > table > tbody > tr.ant-table-placeholder > td > div > div > p'));
                return noDataElement.length > 0;
            } catch (error) {
                return false;
            }
        };

        while (true) {
            const hasNoData = await checkForData();
            
            if (!hasNoData) {
                logger.info('OTP verification detected!');
                playSound('ping.mp3', (err) => {
                    if (err) logger.error('Error playing sound:', err);
                });
                // Add additional notification methods here if needed
                break;
            }

            logger.info('No OTP found, refreshing page...');
            await driver.navigate().refresh();
            await driver.sleep(REFRESH_INTERVAL);
        }
    } catch (error) {
        logger.error(`Monitoring failed: ${error.message}`);
    }
}

async function processAccount(account) {
    const logger = createLogger(account.username);
    const driver = await setupDriver();

    try {
        const loginSuccess = await login(driver, account, logger);
        if (!loginSuccess) {
            await driver.quit();
            return;
        }

        await monitorVerification(driver, logger);
    } catch (error) {
        logger.error(`Unexpected error: ${error.message}`);
        await driver.quit();
    }
}

// Handle CTRL+C
process.on('SIGINT', async () => {
    console.log('\nShutting down all drivers...');
    await Promise.all(drivers.map(driver => driver.quit()));
    process.exit();
});

// Main execution
(async () => {
    const accounts = await readAccounts();
    console.log(`Found ${accounts.length} accounts to process`);

    for (const account of accounts) {
        await processAccount(account);
    }
})();