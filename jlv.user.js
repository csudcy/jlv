// ==UserScript==
// @name         Jira Link Visualiser
// @namespace    http://github.com/csudcy/jlv/
// @version      0.1
// @description  Visualise Jira ticket links!
// @author       Nicholas Lee
// @match        https://*.atlassian.net/browse/*
// @require https://cdnjs.cloudflare.com/ajax/libs/jquery/2.1.1/jquery.min.js
// @require https://cdnjs.cloudflare.com/ajax/libs/vis/4.7.0/vis.min.js
// @resource visJS_CSS  https://cdnjs.cloudflare.com/ajax/libs/vis/4.7.0/vis.min.css
// @grant    GM_addStyle
// @grant    GM_getResourceText
// ==/UserScript==

/*
TODO:
* Show JLV button after re-render (e.g. after editing links)
* Improve layout:
  * See if there'a a way to layout without crossing lines
  * Don't leave unconnected components far away
  * Add re-layout button
* Add hyperlinks to tickets
* Ticket summary panel on click
* Show summary
  * Number of tickets in each status
* Stop AJAX requests when JLV is closed
* Group into epic rows
* Group into Sprint columns
* Filtering:
  * Allow filtering by project
  * Allow filtering by epic
  * Allow filtering by sprint
  * Allow filtering by name
  * Allow filtering by other
* Edit mode
  * Drag to add new links
  * Remove existing links
* JLV links on agile board view
  * Mini view on hover?
* JLV link at sprint level?
* Persist ticket information until page reload?

DONE:
* Show ticket & related tickets in a graph
* Add JLV button to epics
* Add a title
* Show summary - Number of tickets
* Show VisJS config options
* Check links don't exist already before adding them
* Fit the view when adding nodes/edges so everything is onscreen
* Improve layout -  Work out why it's not always strictly hierarchical - Bad data (cycles!)
*/


GM_addStyle(
    GM_getResourceText('visJS_CSS')
);

GM_addStyle([
    '.jlv_button {',
        'margin-left: 5px;',
        'font-weight: bold;',
        'font-size: 16px;',
        'background-color: darkmagenta;',
        'padding: 4px;',
        'border-radius: 5px;',
        'color: whitesmoke;',
        'cursor: cell;',
        '-webkit-user-select: none;',
    '}',

    '.jlv {',
        'position: absolute;',
        'height: 100%;',
        'width: 100%;',
    '}',

    '.jlv_graph {',
        'position: absolute;',
        'height: 100%;',
        'width: 100%;',
        'background-color: lightgray;',
    '}',

    '.jlv_settings {',
        'position: absolute;',
        'height: 100%;',
        'width: 30%;',
        'right: 0px;',
        'background-color: gray;',
        'display: none;',
        'overflow-y: auto;',
        'overflow-x: hidden;',
    '}',

    '.jlv_title {',
        'position: absolute;',
        'top: 0px;',
        'left: 0px;',
        'font-weight: bold;',
        'font-size: 2.0em;',
    '}',

    '.jlv_summary {',
        'position: absolute;',
        'bottom: 0px;',
        'left: 0px;',
        'font-size: 1.5em;',
    '}',

    '.jlv_close {',
        'position: absolute;',
        'top: 5px;',
        'right: 5px;',
    '}',

    '.jlv_toggle_settings {',
        'position: absolute;',
        'top: 45px;',
        'right: 5px;',
    '}',
''].join('\n'));

var nodes,
    edges,
    network,
    STATUS_COLOURS = {
        'Open': '#cc4444',
        'In Progress': '#f0ba18',
        'In Review': '#9e7013',
        'In Test': '#95ff7a',
        'Closed': '#9744a8'
    };

function open_jlv_for_issue_links() {
    // Setup the page
    _hide_page();
    _add_jlv('Linked tickets');
    _init_graph();

    // Add current ticket
    add_ticket(
        $('#key-val').data('issue-key')
    );
}

function open_jlv_for_epic_tickets() {
    // Setup the page
    _hide_page();
    _add_jlv('Epic tickets');
    _init_graph();

    // Add all epic tickets
    $('#ghx-issues-in-epic-table tr').each(function(index, epic_ticket_tr) {
        add_ticket(
            $(epic_ticket_tr).data('issuekey')
        );
    })
}

function _hide_page() {
    $('#page').hide();
}

function _add_jlv(jlv_type) {
    var ticket_id = $('#key-val').data('issue-key'),
        summary = $('#summary-val').text(),
        title = jlv_type+' for '+ticket_id+': '+summary;

    // Add the container
    $('<div class="jlv"><div class="jlv_graph"></div></div>')
        .appendTo('body')
    // Add the title
    .append(
        $('<span class="jlv_title">'+title+'</span>')
    )
    // Add the summary
    .append(
        $('<span class="jlv_summary"></span>')
    )
    // Add settings panel
    .append(
        $('<div class="jlv_settings"></span>')
    )
    // Add close button
    .append(
        $('<span class="jlv_close jlv_button">Close</span>')
            .click(close_jlv)
    )
    // Add settings toggle
    .append(
        $('<span class="jlv_toggle_settings jlv_button">Settings</span>')
            .click(toggle_settings)
    )
    ;
}

function _init_graph() {
    // Init the graph
    nodes = new vis.DataSet();
    edges = new vis.DataSet();
    network = new vis.Network(
        $('.jlv_graph')[0],
        //data
        {
            nodes: nodes,
            edges: edges
        },
        // options
        {
            configure: {
                container: $('.jlv_settings')[0]
            },
            layout: {
                hierarchical: {
                    sortMethod: 'directed'
                }
            }
        }
    );
    
    // Add change listeners
    nodes.on('*', function (event, properties, senderId) {
        // UPdate the node summary
        $('.jlv_summary').text(nodes.length+' issues');
        
        // Wait a bit then fit the view to the nodes
        delayed_fit();
    });
}

var fit_timeout;
function delayed_fit() {
    if (fit_timeout !== undefined) {
        clearTimeout(fit_timeout);
    }
    
    fit_timeout = setTimeout(function() {
        // Fit the view to the network
        network.fit({
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad'
            }
        });
    }, 50);
}

function add_ticket(ticket_id) {
    if (nodes.get(ticket_id) === null) {
        // Add this ticket as a node
        nodes.add({
            id: ticket_id,
            label: ticket_id,
            title: 'Loading...',
            shape: 'box'
        });
        network.redraw();
        
        // Load ticket information
        var ticket_url = window.location.origin + '/rest/api/2/issue/' + ticket_id + '?fields=issuelinks,issuetype,status,summary';
        $.ajax(
            ticket_url,
            {
                success: function(data, textStatus, jqXHR) {
                    add_ticket_info(
                        ticket_id,
                        data.fields.summary,
                        data.fields.issuetype.name,
                        data.fields.status.name,
                        data.fields.issuelinks.map(function(link) {
                            if (link.outwardIssue) {
                                return {from: ticket_id, to:link.outwardIssue.key, type: link.type.name};
                            }
                            if (link.inwardIssue) {
                                return {from: link.inwardIssue.key, to:ticket_id, type: link.type.name};
                            }
                            console.log('Unkown link type!', link);
                        }).filter(function(link) {
                            return link;
                        })
                    );
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    nodes.update({
                        id: ticket_id,
                        title: errorThrown
                    });
                }
            }
        );
    }
}

function add_ticket_info(ticket_id, summary, type, status, links) {
    // Update node details
    nodes.update({
        id: ticket_id,
        title: ticket_id+': '+summary+' ('+type+', '+status+')',
        shape: 'ellipse',
        color: STATUS_COLOURS[status] || 'black'
    });

    // Add related tickets & links
    links.forEach(function(link) {
        add_ticket(link['from']);
        add_ticket(link['to']);
        
        var link_id = link['from']+'::'+link['to']+'::'+link['type'];
        if (edges.get(link_id) === null) {
            // Show edges differently
            if (link['type'] == 'Blocks') {
                edges.add({
                    id: link_id,
                    from: link['from'],
                    to: link['to'],
                    arrows: 'to'
                });
            } else if (link['type'] == 'Relates') {
                edges.add({
                    id: link_id,
                    from: link['from'],
                    to: link['to'],
                    dashes: true
                });
            }else {
                console.log('Ignored link', link);
            }
        }
    });
}

function toggle_settings() {
    $('.jlv_settings').toggle();
}

function close_jlv() {
    _destroy_graph();
    _remove_jlv();
    _show_page();
}

function _destroy_graph() {
    network.destroy();
    network = undefined;
    nodes = undefined;
    edges = undefined;
}

function _remove_jlv() {
    $('.jlv').remove();
}

function _show_page() {
    $('#page').show();
}

function main() {
    // Add the show button for links
    $('<span class="jlv_open jlv_button">JLV</span>')
        .click(open_jlv_for_issue_links)
        .appendTo('#linkingmodule_heading');
    
    // Add the show button for epic
    $('<span class="jlv_open jlv_button">JLV</span>')
        .click(open_jlv_for_epic_tickets)
        .appendTo('#greenhopper-epics-issue-web-panel_heading');
}
main();
