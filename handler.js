'use strict';

// to execute use: sls invoke local --function hello --data '{"origin": "SFO", "destination": "YOW", "date": "2017-04-14"}'
// to deploy use: sls deploy

const request = require("request")
const fs = require("fs")

module.exports.hello = (event, context, callback) => {
  console.log("Hitting United...")

  const query = JSON.parse(fs.readFileSync("united-default-awd-request.json", "utf-8"))
  query.Origin = event.origin
  query.Destination = event.destination
  query.DepartDate = event.date   // might need different format
  query.ReturnDate = event.date   // might need different format

  const results = []  // departureTimeLocal, arrivalTimeLocal, lowestEconomy, lowestBusiness, lowestFirst

  request.post("https://www.united.com/ual/en/us/flight-search/book-a-flight/flightshopping/getflightresults/awd", {body: query, json: true}, (error, response, body) => {
    //const body = JSON.parse(fs.readFileSync("sample-united-awd.json", "utf-8"))
    const flights = body.data.Trips[0].Flights

    for (var flight of flights) {
      const result = {lowestEconomy: null, lowestBusiness: null, lowestFirst: null}
      result.departureTimeLocal = Date.parse(`${flight.DepartDateTime} UTC`)

      // Arrival time depends on if there's a connection or not
      if (flight.Connections.length == 0) {
        result.arrivalTimeLocal = Date.parse(`${flight.DestinationDateTime} UTC`)
      } else {
        result.arrivalTimeLocal = Date.parse(`${flight.Connections[flight.Connections.length - 1].DestinationDateTime} UTC`)
      }

      // Map the United mileage to our data structures
      for (var product of flight.Products) {
        if (product.Prices.length > 0) {
          const milesRequired = product.Prices[0].Amount
          if (product.ProductTypeDescription.startsWith("Economy"))
            result.lowestEconomy = result.lowestEconomy === null ? milesRequired : Math.min(result.lowestEconomy, milesRequired)
          if (product.ProductTypeDescription.startsWith("Business"))
            result.lowestBusiness = result.lowestBusiness === null ? milesRequired : Math.min(result.lowestBusiness, milesRequired)
          if (product.ProductTypeDescription.startsWith("First"))
            result.lowestFirst = result.lowestFirst === null ? milesRequired : Math.min(result.lowestFirst, milesRequired)
        }
      }

      let addFlight = true

      // Add filters for time
      const departureHourBefore = event.departureHourBefore || 24
      const departureHourAfter = event.departureHourAfter || 0
      const arrivalHourBefore = event.arrivalHourBefore || 24
      const arrivalHourAfter = event.arrivalHourAfter || 0

      const departureHour = new Date(result.departureTimeLocal).getUTCHours()
      const arrivalHour = new Date(result.arrivalTimeLocal).getUTCHours()
      if (departureHour < departureHourAfter || departureHour > departureHourBefore || arrivalHour < arrivalHourAfter || arrivalHour > arrivalHourBefore)
        addFlight = false

      // Dont show flights missing seats in a class we want
      const maxEconomyMiles = event.maxEconomyMiles || null
      const maxBusinessMiles = event.maxBusinessMiles || null
      const maxFirstMiles = event.maxFirstMiles || null

      if (maxEconomyMiles !== null && result.lowestEconomy === null)
        addFlight = false
      if (maxBusinessMiles !== null && result.lowestBusiness === null)
        addFlight = false
      if (maxFirstMiles !== null && result.lowestFirst === null)
        addFlight = false

      // Dont show flights requiring too many miles for the class we wanted
      if (maxEconomyMiles !== null && result.lowestEconomy > maxEconomyMiles)
        addFlight = false
      if (maxBusinessMiles !== null && result.lowestBusiness > maxBusinessMiles)
        addFlight = false
      if (maxFirstMiles !== null && result.lowestFirst > maxFirstMiles)
        addFlight = false

      if (addFlight)
        results.push(result)
    }

    callback(null, results)
  })
}