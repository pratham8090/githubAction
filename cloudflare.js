const request = require("request-promise");

const apiCall = async (options) => {
    const response = await request(options);
    return JSON.parse(response);
};

const getZone = async (domain, api_url, headers) => {
    console.log(`POST DEPLOYMENT ::: getZone domain ${domain}`);
    let zoneId = "";
    const response = await apiCall({
        method: 'GET',
        url: `${api_url}?name=${domain}`,
        headers
    });
    if (response.result.length) {
        zoneId = response.result[0].id;
    }
    console.log(`POST DEPLOYMENT ::: getZone zoneId ${zoneId}`);
    return zoneId;
};

const getDNSRecords = async (domain, api_url, headers) => {
    console.log(`POST DEPLOYMENT ::: getDNSRecords domain ${domain} `);
    let record = {
        'aRecord': {},
        'wwwRecord': {},
        'zoneId': ''
    };
    let zoneId = await getZone(domain, api_url, headers);
    if (zoneId !== '') {
        record.zoneId = zoneId;
        const {
            result
        } = await apiCall({
            method: 'GET',
            url: `${api_url}/${zoneId}/dns_records`,
            headers
        });
        if (result.length) {
            for (let i = 0; i < result.length; i++) {
                if (result[i].type === `CNAME` && result[i].name === `www.${domain}`) {
                    record.wwwRecord.id = result[i].id;
                    record.wwwRecord.content = result[i].content;
                }
                if (result[i].type === `A` && result[i].name === domain) {
                    record.aRecord.id = result[i].id;
                    record.aRecord.content = result[i].content;
                }
            }
        }
    }
    console.log(`POST DEPLOYMENT ::: getDNSRecords domain ${domain} response ${JSON.stringify(record)}`);
    return record;
};

const updateRecord = async (zoneId, record, domain, type, value, name, api_url, headers) => {
    const options = {
        method: 'POST',
        url: `${api_url}/${zoneId}/dns_records`,
        headers,
        body: ''
    };
    if (Object.keys(record).length === 0) {
        options.body = JSON.stringify({
            type: type,
            name: name,
            content: value,
            ttl: 3600,
            proxied: true
        });
        await apiCall(options);
        console.log(`POST DEPLOYMENT ::: updateRecord domain ${domain} name ${name} type ${type} value ${value} RECORD ADDED.`);
    } else if (record.content !== value) {
        options.body = JSON.stringify({
            type: type,
            name: name,
            content: value,
            ttl: 3600,
            proxied: true
        });
        options.method = 'PUT';
        options.url = `${api_url}/${zoneId}/dns_records/${record.id}`;
        await apiCall(options);
        console.log(`POST DEPLOYMENT ::: updateRecord domain ${domain} name ${name} type ${type} value ${value} RECORD UPDATED.`);
    } else {
        console.log(`POST DEPLOYMENT ::: updateRecord domain ${domain} name ${name} type ${type} value ${value} RECORD ALREADY EXISTS.`);
    }
};

const getPageRule = async (domain, zoneId, api_url, headers) => {
    console.log(`POST DEPLOYMENT ::: getPageRule domain ${domain} zoneId ${zoneId}`);
    const {
        result
    } = await apiCall({
        method: 'GET',
        url: `${api_url}/${zoneId}/pagerules`,
        headers
    });

    return result.length;
};

const createPageRule = async (domain, zoneId, api_url, headers) => {
    console.log(`POST DEPLOYMENT ::: createPageRule domain ${domain} zoneId ${zoneId}`);
    const response = await apiCall({
        method: 'POST',
        url: `${api_url}/${zoneId}/pagerules`,
        headers,
        body: JSON.stringify({
            "targets": [{
                "target": "url",
                "constraint": {
                    "operator": "matches",
                    "value": `${domain}/*`
                }
            }],
            "actions": [{
                "id": "forwarding_url",
                "value": {
                    "url": `https://www.${domain}/$1`,
                    "status_code": 301
                }
            }],
            "status": "active"
        })
    });
    console.log(`POST DEPLOYMENT ::: createPageRule domain ${domain} response ${response}`);
};

module.exports.updateDomainCloudflare = async (cnameVal, domainData) => {
    const {
        domain,
        api_url,
        auth,
        auth_email
    } = domainData;
    console.log(`POST DEPLOYMENT ::: updateDomainCloudflare domain ${domain} STARTED.`);
    const headers = {
        'X-Auth-Key': auth,
        'Content-Type': 'application/json',
        'X-Auth-Email': auth_email
    }
    const {
        zoneId,
        aRecord,
        wwwRecord
    } = await getDNSRecords(domain, api_url, headers);
    await updateRecord(zoneId, aRecord, domain, 'A', '192.0.2.1', domain, api_url, headers);
    await updateRecord(zoneId, wwwRecord, domain, 'CNAME', cnameVal, 'www', api_url, headers);
    console.log(`POST DEPLOYMENT ::: updateDomainCloudflare domain ${domain} COMPLETED.`);

    // PAGE RULE
    console.log(`POST DEPLOYMENT ::: updateDomainCloudflare domain ${domain} PAGE RULE STARTED.`);
    const isRule = await getPageRule(domain, zoneId, api_url, headers);
    if (!isRule) {
        await createPageRule(domain, zoneId, api_url, headers);
    } else {
        console.log(`POST DEPLOYMENT ::: updateDomainCloudflare domain ${domain} PAGE RULE ALREADY EXISTS.`);
    }
    console.log(`POST DEPLOYMENT ::: updateDomainCloudflare domain ${domain} PAGE RULE COMPLETED.`);
};