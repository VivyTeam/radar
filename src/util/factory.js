/* eslint no-constant-condition: "off" */

const d3 = require('d3')
const _ = {
  map: require('lodash/map'),
  uniqBy: require('lodash/uniqBy'),
  capitalize: require('lodash/capitalize'),
  each: require('lodash/each')
}

const InputSanitizer = require('./inputSanitizer')
const Radar = require('../models/radar')
const Quadrant = require('../models/quadrant')
const Ring = require('../models/ring')
const Blip = require('../models/blip')
const GraphingRadar = require('../graphing/radar')
const QueryParams = require('./queryParamProcessor')
const MalformedDataError = require('../exceptions/malformedDataError')
const SheetNotFoundError = require('../exceptions/sheetNotFoundError')
const ContentValidator = require('./contentValidator')
const Sheet = require('./sheet')
const ExceptionMessages = require('./exceptionMessages')
const GoogleAuth = require('./googleAuth')

const plotRadar = function (title, blips, currentRadarName, alternativeRadars) {
  document.title = 'Tech Radar 2021.11'
  d3.selectAll('.loading').remove()

  var rings = _.map(_.uniqBy(blips, 'ring'), 'ring')
  var ringMap = {}
  var maxRings = 4

  _.each(rings, function (ringName, i) {
    if (i === maxRings) {
      throw new MalformedDataError(ExceptionMessages.TOO_MANY_RINGS)
    }
    ringMap[ringName] = new Ring(ringName, i)
  })

  var quadrants = {}
  _.each(blips, function (blip) {
    if (!quadrants[blip.quadrant]) {
      quadrants[blip.quadrant] = new Quadrant(_.capitalize(blip.quadrant))
    }
    quadrants[blip.quadrant].add(new Blip(blip.name, ringMap[blip.ring], blip.isNew.toLowerCase() === 'true', blip.topic, blip.description))
  })

  var radar = new Radar()
  _.each(quadrants, function (quadrant) {
    radar.addQuadrant(quadrant)
  })

  if (alternativeRadars !== undefined || true) {
    alternativeRadars.forEach(function (sheetName) {
      radar.addAlternative(sheetName)
    })
  }

  if (currentRadarName !== undefined || true) {
    radar.setCurrentSheet(currentRadarName)
  }

  var size = (window.innerHeight - 133) < 620 ? 620 : window.innerHeight - 133

  new GraphingRadar(size, radar).init().plot()
}

const GoogleSheet = function (sheetReference, sheetName) {
  var self = {}

  self.build = function () {
    var sheet = new Sheet(sheetReference)
    sheet.validate(function (error, apiKeyEnabled) {

      if (error instanceof SheetNotFoundError) {
        plotErrorMessage(error)
        return
      }

      self.authenticate(false, apiKeyEnabled)
    })
  }

  function createBlipsForProtectedSheet (documentTitle, values, sheetNames) {
    if (!sheetName) {
      sheetName = sheetNames[0]
    }
    values.forEach(function (value) {
      var contentValidator = new ContentValidator(values[0])
      contentValidator.verifyContent()
      contentValidator.verifyHeaders()
    })

    const all = values
    const header = all.shift()
    var blips = _.map(all, blip => new InputSanitizer().sanitizeForProtectedSheet(blip, header))
    plotRadar(documentTitle + ' - ' + sheetName, blips, sheetName, sheetNames)
  }

  self.authenticate = function (force = false, apiKeyEnabled, callback) {
    if (!apiKeyEnabled) {
      GoogleAuth.loadGoogle(function (e) {
        GoogleAuth.login(_ => {
          var sheet = new Sheet(sheetReference)
          sheet.processSheetResponse(sheetName, createBlipsForProtectedSheet, error => {
            if (error.status === 403) {
              plotUnauthorizedErrorMessage()
            } else {
              plotErrorMessage(error)
            }
          })
          if (callback) { callback() }
        }, force)
      })
    } else {
      GoogleAuth.loadGoogle(function (e) {
        var sheet = new Sheet(sheetReference)
        sheet.processSheetResponse(sheetName, createBlipsForProtectedSheet, error => {
          if (error.status === 403) {
            plotUnauthorizedErrorMessage()
          } else {
            plotErrorMessage(error)
          }
        })
        if (callback) { callback() }
      })
    }
  }

  self.init = function () {
    plotLoading()
    return self
  }

  return self
}

const CSVDocument = function (url) {
  var self = {}

  self.build = function () {
    d3.csv('https://raw.githubusercontent.com/betheunique/radar-files/main/vivy_radar.csv').then(createBlips)
  }

  var createBlips = function (data) {
    try {
      var columnNames = data.columns
      delete data.columns
      var contentValidator = new ContentValidator(columnNames)
      contentValidator.verifyContent()
      contentValidator.verifyHeaders()
      var blips = _.map(data, new InputSanitizer().sanitize)
      plotRadar('FileName(url)', blips, 'CSV File', [])
    } catch (exception) {
      plotErrorMessage(exception)
    }
  }

  self.init = function () {
    plotLoading()
    return self
  }

  return self
}

const DomainName = function (url) {
  var search = /.+:\/\/([^\\/]+)/
  var match = search.exec(decodeURIComponent(url.replace(/\+/g, ' ')))
  return match == null ? null : match[1]
}

const FileName = function (url) {
  var search = /([^\\/]+)$/
  var match = search.exec(decodeURIComponent(url.replace(/\+/g, ' ')))
  if (match != null) {
    var str = match[1]
    return str
  }
  return url
}

const GoogleSheetInput = function () {
  var self = {}
  var sheet

  self.build = function () {
    var domainName = DomainName(window.location.search.substring(1))
    var queryString = window.location.href.match(/sheetId(.*)/)
    var queryParams = queryString ? QueryParams(queryString[0]) : {}
      sheet = CSVDocument(queryParams.sheetId)
      sheet.init().build()
  }

  return self
}

function setDocumentTitle () {
  document.title = 'Vivy Tech Radar 2021.11'
}

function plotLoading (content) {
  content = d3.select('body')
    .append('div')
    .attr('class', 'loading')

  setDocumentTitle()
}


function plotFooter (content) {
  content
    .append('div')
    .attr('id', 'footer')
    .append('div')
    .attr('class', 'footer-content')
    .append('p')
    .append('div')
    .text('What is the Tech Radar?' +
    'Vivy Tech Radar is a list of technologies that we have assessed and experienced with our production usage and internal assesment:' + 
    
    'ADOPT — Technologies that we have a great deal of confidence in to serve our purpose. Proven low risk technologies that are widely used in the Vivy production environment and that we recommend using.' +
    'TRIAL — Slightly risky technologies, but seen some prototypes and research. Some engineers have the knowledge or the solutions to some real problems and they have the experience in the organization.' + 
    'ASSESS — High risk technologies, but great potential for us. It is great to invest some time in prototyping and research. Very few engineers have the knowledge and they promote it in the organization.' +
    'HOLD — Technologies not recommended for new projects. This technology is to support existing projects and is not recommended.')
    .html('Based on <a href="https://www.thoughtworks.com"> Thoughtworks</a>. ' +
          '<a href="https://github.com/thoughtworks/build-your-own-radar">Build Your Own RADAR</a>.')
}


function plotErrorMessage (exception) {
  var message = 'Oops! It seems like there are some problems with loading your data. '

  var content = d3.select('body')
    .append('div')
  setDocumentTitle()
  if (exception instanceof MalformedDataError) {
    message = message.concat(exception.message)
  } else if (exception instanceof SheetNotFoundError) {
    message = exception.message
  } else {
    console.error(exception)
  }

  const container = content.append('div').attr('class', 'error-container')
  var errorContainer = container.append('div')
    .attr('class', 'error-container__message')
  errorContainer.append('div').append('p')
    .html(message)

  var homePageURL = window.location.protocol + '//' + window.location.hostname
  homePageURL += (window.location.port === '' ? '' : ':' + window.location.port)
  var homePage = '<a href=' + homePageURL + '>GO BACK</a>'

  errorContainer.append('div').append('p')
    .html(homePage)

  plotFooter(content)
}

function plotUnauthorizedErrorMessage () {
  var content = d3.select('body')
    .append('div')
    .attr('class', 'input-sheet')
  setDocumentTitle()

  plotLogo(content)

  var bannerText = '<div><h1>Build your own radar</h1></div>'

  plotBanner(content, bannerText)

  d3.selectAll('.loading').remove()
  const currentUser = GoogleAuth.geEmail()
  let homePageURL = window.location.protocol + '//' + window.location.hostname
  homePageURL += (window.location.port === '' ? '' : ':' + window.location.port)
  const goBack = '<a href=' + homePageURL + '>GO BACK</a>'
  const message = `<strong>Oops!</strong> Looks like you are accessing this sheet using <b>${currentUser}</b>, which does not have permission.Try switching to another account.`

  const container = content.append('div').attr('class', 'error-container')

  const errorContainer = container.append('div')
    .attr('class', 'error-container__message')

  errorContainer.append('div').append('p')
    .attr('class', 'error-title')
    .html(message)

  const button = errorContainer.append('button')
    .attr('class', 'button switch-account-button')
    .text('SWITCH ACCOUNT')

  errorContainer.append('div').append('p')
    .attr('class', 'error-subtitle')
    .html(`or ${goBack} to try a different sheet.`)

  button.on('click', _ => {
    var queryString = window.location.href.match(/sheetId(.*)/)
    var queryParams = queryString ? QueryParams(queryString[0]) : {}
    const sheet = GoogleSheet(queryParams.sheetId, queryParams.sheetName)
    sheet.authenticate(true, false, _ => {
      content.remove()
    })
  })
}

module.exports = GoogleSheetInput
