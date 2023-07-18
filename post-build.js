const fs = require('fs-extra');
const path = require("path");
const core = require('@actions/core');
const request = require("request-promise");

const {
    updateDeploymentStatus
} = require('./database-api-call');

const options = {
    method: 'GET',
    url: ``,
    headers: {
        'Content-Type': 'application/json',
    }
};

const syncSiteData = async (apiURL, domain, filePath, localPath) => {
    // for image.json 
    options.url = `${apiURL}/api/template-images/domain?domain=${domain}`;
    let apiImages = await request(options);
    apiImages = JSON.parse(apiImages);
    console.log(` syncSiteData ${domain} apiImages ${apiImages.length} `);
    await fs.outputFile(`${filePath}/public/${domain}/json/images.json`, JSON.stringify(apiImages));

    // for robot.txt
    options.url = `${apiURL}/api/site?domain=${domain}`;
    let apiHomeData = await request(options);
    apiHomeData = JSON.parse(apiHomeData);
    console.log(` syncSiteData ${domain} apiHomeData.robots_text ${apiHomeData.robots_text} `);
    fs.writeFileSync(`${filePath}/public/${domain}/robots.txt`, apiHomeData.robots_text);
};

const syncChunks = async (defaultLambdaPath, nextServerlessPath) => {
    console.log('POST BUILD ::: CREATING CHUNKS DIRECTORY STARTED');
    fs.mkdirSync(`${defaultLambdaPath}/chunks`);
    console.log('POST BUILD ::: CREATING CHUNKS DIRECTORY COMPELETED');

    console.log('POST BUILD ::: SYNC LOCAL DIR STARTED');
    fs.copySync(`${nextServerlessPath}/chunks`, `${defaultLambdaPath}/chunks`, {
        recursive: true
    });
    console.log('POST BUILD ::: SYNC LOCAL DIR COMPELETED');
};

const syncPublicDomainImageJson = async (domain, apiURL, defaultLambdaPath, localBasePath) => {
    console.log('POST BUILD ::: CREATING PUBLIC DIRECTORY STARTED');
    if (!fs.existsSync(`${defaultLambdaPath}/public`))
        fs.mkdirSync(`${defaultLambdaPath}/public`);
    console.log('POST BUILD ::: CREATING PUBLIC DIRECTORY COMPELETED');

    console.log('POST BUILD ::: COPYING SITE DATA STARTED');
    for (let i = 0; i < domain.length; i++) {
        await syncSiteData(apiURL, domain[i], defaultLambdaPath, localBasePath);
    }

    // for domains.json
    fs.writeFileSync(`${defaultLambdaPath}/public/domains.json`, JSON.stringify(domain));

    console.log('POST BUILD ::: COPYING  SITE DATA COMPELETED');
};

const main = async () => {
    console.log(`POST BUILD ::: STARTED RETRY_COUNT ${process.env.RETRY_COUNT}`);
    require('dotenv').config();

    const templateName = process.env.TEMPLATE_NAME;
    const apiURL = process.env.API_URL || "https://deployapi.ecommcube.com";

    let domain = process.env.DOMAIN;
    domain = domain.split(',');

    const defaultLambdaPath = path.join(__dirname, '/', `${templateName}/.serverless_nextjs/default-lambda`);
    const nextServerlessPath = path.join(__dirname, '/', `${templateName}/.next/serverless`);
    const localBasePath = path.join(__dirname, '/', `${templateName}`);

    await syncChunks(defaultLambdaPath, nextServerlessPath);
    await syncPublicDomainImageJson(domain, apiURL, defaultLambdaPath, localBasePath);

    console.log(`POST BUILD ::: COMPLETED RETRY_COUNT ${process.env.RETRY_COUNT}`);
};

(async () => {
    process.env.RETRY_COUNT = 1;
    await main();
})().catch(async (error) => {
    if (process.env.RETRY_COUNT === 1) {
        console.log(`POST BUILD ::: RETRY_COUNT ${process.env.RETRY_COUNT} ERROR ${error.message}`);
        process.env.RETRY_COUNT = 2;
        await main();
    } else {
        console.log(`POST BUILD ::: RETRY_COUNT ${process.env.RETRY_COUNT} ERROR ${error.message}`);
        try {
            await updateDeploymentStatus({
                certificate_arn: process.env.CERTIFICATE_ARN,
                status: "failed",
                description: `${process.env.RETRY_COUNT}-${error.message}`
            });
            core.setFailed(error.message);
        } catch (updateStatusError) {
            console.log(`POST BUILD ::: UPDATE STATUS ERROR ${updateStatusError.message}`);
            core.setFailed(updateStatusError.message);
        }
    }
});