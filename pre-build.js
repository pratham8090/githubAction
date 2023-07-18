const fs = require('fs-extra');
const path = require("path");
const core = require('@actions/core');
const request = require("request-promise");
const yaml = require('js-yaml');

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

const manifest = {
    "scope": "/",
    "start_url": "/",
    "display": "standalone",
    "theme_color": "#97040c",
    "name": "Towing Minneapolis",
    "background_color": "#ffffff",
    "short_name": "Towing Minneapolis",
    "prefer_related_applications": true,
    "description": "Minneapolis towing services",
    "icons": [{
            "src": "/android-chrome-192x192.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any maskable"
        },
        {
            "src": "/android-chrome-512x512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any maskable"
        }
    ]
};

const getImageSrc = (key, array) => {
    for (let i = 0; i < array.length; i++) {
        if (array[i].tagName === key) {
            return array[i].path;
        }
    }
    return `not-found`;
};

const syncPublicDomainImageJsontoS3 = async (domain, apiURL, localBasePath) => {
    console.log('PRE BUILD ::: COPYING IMAGE.JSON STARTED');
    for (let i = 0; i < domain.length; i++) {
        // for sitemap xsl
        options.url = `${apiURL}/api/site?domain=${domain[i]}`;
        let apiHomeData = await request(options);
        apiHomeData = JSON.parse(apiHomeData);
        console.log(` syncPublicDomainImageJsontoS3 ${domain[i]} apiHomeData.meta_heading_h1 ${apiHomeData.meta_heading_h1} `);
        let siteMapData = fs.readFileSync(`${localBasePath}/public/main-sitemap.xsl`, {
            encoding: 'utf-8'
        });
        siteMapData = siteMapData.
        replaceAll('%BASE_URL%', `${domain[i].startsWith('https://') ? '' : 'https://'}${domain[i]}`).
        replaceAll('%CITY_NAME%', apiHomeData.city).
        replaceAll('%INDUSTRY_NAME%', apiHomeData.industry_name);
        await fs.outputFile(`${localBasePath}/public/${domain[i]}/sitemap.xsl`, siteMapData);

        // for images.json
        options.url = `${apiURL}/api/template-images/domain?domain=${domain[i]}`;
        let apiImages = await request(options);
        apiImages = JSON.parse(apiImages);
        await fs.outputFile(`${localBasePath}/public/${domain[i]}/json/images.json`, JSON.stringify(apiImages));

        // for manifest.json
        manifest.name = apiHomeData.contact_form_sub_title;
        manifest.short_name = apiHomeData.contact_form_sub_title;
        manifest.icons[0].src = getImageSrc('favicon-32', apiImages);
        manifest.icons[1].src = getImageSrc('favicon-32', apiImages);
        console.log(` syncPublicDomainImageJsontoS3 manifest ${JSON.stringify(manifest)} `);
        fs.writeFileSync(`${localBasePath}/public/${domain[i]}/manifest.json`, JSON.stringify(manifest));
    }
    console.log('PRE BUILD ::: COPYING IMAGE.JSON COMPELETED');
};

const updateServerlessParams = (cloudfrontId, localBasePath, deploymentType, domain) => {
    console.log('POST BUILD ::: UPDATING CLOUDFRONT ID IN SERVERLESS YML STARTED');
    let serverless = yaml.load(fs.readFileSync(`${localBasePath}/serverless.yml`, 'utf8'));

    // update cloudfront id
    if (cloudfrontId === `` || cloudfrontId === null || cloudfrontId === 'null') {
        console.log('IN IF CLOUDFRONT ID NULL FRESH DEPLOYMENT');
        delete serverless.nextApp.inputs.cloudfront.distributionId;
        delete serverless.nextApp.inputs.cloudfront.paths;
    }
    // update default certifiacate incase of deployment type development
    if (deploymentType === `development`) {
        console.log('IN IF DEPLOYMENT TYPE development override certificate');
        serverless.nextApp.inputs.cloudfront.certificate.cloudFrontDefaultCertificate = true;
        delete serverless.nextApp.inputs.cloudfront.certificate.acmCertificateArn;
    }
    // update aliases incase of deployment type development
    if (deploymentType === `production`) {
        console.log('IN IF DEPLOYMENT TYPE production override aliases');
        serverless.nextApp.inputs.cloudfront.aliases = domain;
    }

    fs.writeFileSync(`${localBasePath}/serverless.yml`, yaml.dump(serverless), 'utf8');
    console.log('POST BUILD ::: UPDATING CLOUDFRONT ID IN SERVERLESS YML COMPLETED');
};

const main = async () => {
    console.log(`PRE BUILD ::: STARTED RETRY_COUNT ${process.env.RETRY_COUNT}`);
    require('dotenv').config();

    const templateName = process.env.TEMPLATE_NAME;
    const apiURL = process.env.API_URL || "https://deployapi.ecommcube.com" ;
    const cloudfrontId = process.env.CLOUDFRONT_ID;
    const deploymentType = process.env.DEPLOYMENT_TYPE;

    let domain = process.env.DOMAIN;
    domain = domain.split(',');

    const astrikDomain = domain.map((d) => `*.${d}`);
    const localBasePath = path.join(__dirname, '/', `${templateName}`);

    await syncPublicDomainImageJsontoS3(domain, apiURL, localBasePath);
    updateServerlessParams(cloudfrontId, localBasePath, deploymentType, astrikDomain);

    console.log(`PRE BUILD ::: COMPLETED RETRY_COUNT ${process.env.RETRY_COUNT}`);
}

(async () => {
    process.env.RETRY_COUNT = 1;
    await main();
})().catch(async (error) => {
    console.log("🚀 ~ file: pre-build.js:138 ~ error:", error)
    if (process.env.RETRY_COUNT === 1) {
        console.log(`PRE BUILD ::: RETRY_COUNT ${process.env.RETRY_COUNT} ERROR ${error.message}`);
        process.env.RETRY_COUNT = 2;
        await main();
    } else {
        console.log(`PRE BUILD ::: RETRY_COUNT ${process.env.RETRY_COUNT} ERROR ${error.message}`);
        try {
            await updateDeploymentStatus({
                certificate_arn: process.env.CERTIFICATE_ARN,
                status: "failed",
                description: `${process.env.RETRY_COUNT}-${error.message}`
            });
            core.setFailed(error.message);
        } catch (updateStatusError) {
            console.log(`PRE BUILD ::: UPDATE STATUS ERROR ${updateStatusError.message}`);
            core.setFailed(updateStatusError.message);
        }
    }
});