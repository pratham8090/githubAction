const request = require("request-promise");

const baseAPIURL = `https://deployapi.ecommcube.com/api/aws/`;

module.exports.updateDeploymentStatus = async (data) => {
    console.log(`POST DEPLOYMENT ::: updateDeploymentStatus`);
    const options = {
        method: 'PUT',
        url: `${baseAPIURL}cloudfront`,
        body: JSON.stringify(data),
        headers: {
            'Content-Type': 'application/json',
        }
    };
    console.log(options);
    const response = await request(options);
    console.log(`POST DEPLOYMENT ::: updateDeploymentStatus response ${JSON.stringify(response)}`);
};

module.exports.getCloudflareCredentials = async (domain) => {
    console.log(`POST DEPLOYMENT ::: getCloudflareCredentials`);
    const options = {
        method: 'POST',
        url: `${baseAPIURL}cloudfront/getDomainsInfo`,
        body: JSON.stringify({
            domains : domain
        }),
        headers: {
            'Content-Type': 'application/json',
        }
    };
    console.log(options);
    let response = await request(options);
    response = JSON.parse(response);
    console.log(`POST DEPLOYMENT ::: updateDeploymentStatus response ${response.length}`);
    return response;
};