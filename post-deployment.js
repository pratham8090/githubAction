const fs = require('fs');
const path = require("path");
const core = require('@actions/core');

const {
    updateDomainCloudflare,
} = require('./cloudflare');
const {
    updateDeploymentStatus,
    getCloudflareCredentials
} = require('./database-api-call');

/////////////////// Update the following  ///////////////////////////////
// 1. Update cloudfront url to www cname of the domain
// 2. Do non www to www domain forward
// Now using cloudflare as domain registrar
const updateDomain = async (cloudFrontURL, domain) => {
    console.error(`POST DEPLOYMENT ::: updateDomain STARTED`);
    for (let i = 0; i < domain.length; i++) {
        console.error(`POST DEPLOYMENT ::: updateDomain domain ${JSON.stringify(domain[i])}`);
        //await updateDomainNamesilo(`www`, cloudFrontURL.replace('https://', ''), domain[i]);
        await updateDomainCloudflare(cloudFrontURL.replace('https://', ''), domain[i]);
    };
};

const getCloudFrontParams = (templateName) => {
    if (templateName === `testing`) {
        console.log('getCloudFrontParams In Local Condition');
        // For Local Testing
        return {
            id: 'EMYIS95ML6GOZ',
            url: 'https://d3dbste7d5qhh1.cloudfront.net'
        }
    } else {
        const basePath = path.join(__dirname, '/', `${templateName}/`);
        let cloudFront = fs.readFileSync(`${basePath}.serverless/Template.nextApp.CloudFront.json`);
        cloudFront = JSON.parse(cloudFront);

        return cloudFront;
    }
}

const main = async () => {
    console.error(`POST DEPLOYMENT ::: STARTED RETRY_COUNT ${process.env.RETRY_COUNT}`);
    require('dotenv').config();

    const certificateARN = process.env.CERTIFICATE_ARN;
    const templateName = process.env.TEMPLATE_NAME;
    const domain = process.env.DOMAIN;
    const deploymentType = process.env.DEPLOYMENT_TYPE;

    const cloudFront = getCloudFrontParams(templateName);

    await updateDeploymentStatus({
        certificate_arn: certificateARN,
        cloudfront_id: cloudFront.id,
        cloudfront_url: cloudFront.url,
        status: "success"
    });
    
    if (deploymentType === `production`) {
        let cloudflareCred = await getCloudflareCredentials(domain);
        await updateDomain(cloudFront.url, cloudflareCred);
    }
    console.error(`POST DEPLOYMENT ::: COMPLETED RETRY_COUNT ${process.env.RETRY_COUNT}`);
}

(async () => {
    process.env.RETRY_COUNT = 1;
    await main();
})().catch(async (error) => {
    if (process.env.RETRY_COUNT === 1) {
        console.log(`POST DEPLOYMENT ::: RETRY_COUNT ${process.env.RETRY_COUNT} ERROR ${error.message}`);
        process.env.RETRY_COUNT = 2;
        await main();
    } else {
        console.log(`POST DEPLOYMENT ::: RETRY_COUNT ${process.env.RETRY_COUNT} ERROR ${error.message}`);
        try {
            await updateDeploymentStatus({
                certificate_arn: process.env.CERTIFICATE_ARN,
                status: "failed",
                description: `${process.env.RETRY_COUNT}-${error.message}`
            });
            core.setFailed(error.message);
        } catch (updateStatusError) {
            console.log(`POST DEPLOYMENT ::: UPDATE STATUS ERROR ${updateStatusError.message}`);
            core.setFailed(updateStatusError.message);
        }
    }
});