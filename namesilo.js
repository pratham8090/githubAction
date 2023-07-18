const request = require("request-promise");
const xmlToJson = require('xml-js');

const NAMESILO_CONFIG = {
    api_url: "https://www.namesilo.com/api/",
    auth: `06ca4f521c820e8db909`,
    customer_id: 16214275,
};

/// get dns records from namsilo ///
const getDNSRecords = async (domain) => {
    console.log(`POST DEPLOYMENT ::: getDNSRecords domain ${domain}`);
    let record = {};
    const options = {
        method: 'GET',
        url: `${NAMESILO_CONFIG.api_url}dnsListRecords?version=1&type=xml&key=${NAMESILO_CONFIG.auth}&domain=${domain}`,
        headers: {}
    };
    const response = await request(options);
    let dnsRecords = xmlToJson.xml2json(response, {
        compact: true,
        spaces: 4
    });
    dnsRecords = JSON.parse(dnsRecords);
    if (Array.isArray(dnsRecords.namesilo.reply.resource_record)) {
        dnsRecords.namesilo.reply.resource_record.map((rec) => {
            if (rec.type._text === `CNAME` && rec.host._text === `www.${domain}`) {
                record.recordId = rec.record_id._text;
                record.value = rec.value._text;
            }
        });
    }
    console.log(`POST DEPLOYMENT ::: getDNSRecords domain ${domain} response ${JSON.stringify(record)}`);
    return record;

};

/// Update domain cname ///
module.exports.updateDomainNamesilo = async (cname, cnameVal, domain) => {
    // Adding CNAME WWW
    const record = await getDNSRecords(domain);
    if (Object.keys(record).length !== 0) {
        console.log(`POST DEPLOYMENT ::: addCNAMEofDomainInRegistrar domain ${domain} update entry record.value ${record.value} cnameVal ${cnameVal}`);
        if (cnameVal !== record.value) {
            await request({
                method: 'GET',
                url: `${NAMESILO_CONFIG.api_url}dnsUpdateRecord?version=1&type=xml&key=${NAMESILO_CONFIG.auth}&domain=${domain}&rrid=${record.recordId}&rrhost=${cname}&rrvalue=${cnameVal}&rrttl=3600`,
            });
        }
    } else {
        console.log(`POST DEPLOYMENT ::: addCNAMEofDomainInRegistrar domain ${domain} new entry`);
        const response = await request({
            method: 'GET',
            url: `${NAMESILO_CONFIG.api_url}dnsAddRecord?version=1&type=xml&key=${NAMESILO_CONFIG.auth}&domain=${domain}&rrtype=CNAME&rrhost=${cname}&rrvalue=${cnameVal}&rrttl=3600`,
        });
        //console.log(`POST DEPLOYMENT ::: addCNAMEofDomainInRegistrar domain ${domain} response ${JSON.stringify(response)}`);
    }
};